import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseService } from "../database/database.service";
import { COIN_PACKAGES, CoinPackage } from "./constants/coin-packages.constant";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private configService: ConfigService,
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
  ) {}

  getCoinPackages(): CoinPackage[] {
    return COIN_PACKAGES;
  }

  getCoinPackageById(id: string): CoinPackage | undefined {
    return COIN_PACKAGES.find((p) => p.id === id);
  }

  async processVkPayment(body: string): Promise<any> {
    const params = Object.fromEntries(new URLSearchParams(body));
    const sig = params.sig;
    delete params.sig;

    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("");

    const VK_APP_SECRET = this.configService.get<string>("VK_APP_SECRET") || "";
    const expected = crypto
      .createHash("md5")
      .update(sorted + VK_APP_SECRET)
      .digest("hex");

    if (sig !== expected) {
      return { error: { error_code: 10, error_msg: "Invalid sig" } };
    }

    const type = params.notification_type;
    const item = params.item;
    const pkg = this.getCoinPackageById(item);

    if (type === "get_item" || type === "get_item_test") {
      if (!pkg) return { error: { error_code: 20, error_msg: "Unknown item" } };
      return {
        response: {
          title: `${pkg.coins} монет`,
          price: pkg.price,
          item_id: pkg.id,
          expiration: 0,
        },
      };
    }

    if (type === "order_status_change" || type === "order_status_change_test") {
      if (params.status !== "chargeable")
        return { error: { error_code: 100, error_msg: "Not chargeable" } };
      if (!pkg) return { error: { error_code: 20, error_msg: "Unknown item" } };

      const vkId = parseInt(params.user_id, 10);
      const orderId = parseInt(params.order_id, 10);
      const user = await this.dbService.findUserByVkId(vkId);

      if (!user)
        return { error: { error_code: 22, error_msg: "User not found" } };

      const newCoins = user.coins + pkg.coins;
      await this.dbService.updateUserCoins(user.id, newCoins);
      this.creditCoinsToOnlineUser(user.id, newCoins);

      this.logger.log(`VK Pay: +${pkg.coins} coins → ${user.nickname}`);

      return { response: { order_id: orderId, app_order_id: orderId } };
    }

    return { error: { error_code: 100, error_msg: "Unknown type" } };
  }

  async processYoomoneyPayment(body: string): Promise<void> {
    const params = Object.fromEntries(new URLSearchParams(body));
    const YOOMONEY_SECRET =
      this.configService.get<string>("YOOMONEY_SECRET") || "";

    if (YOOMONEY_SECRET) {
      const hashStr = [
        params.notification_type,
        params.operation_id,
        params.amount,
        params.currency,
        params.datetime,
        params.sender,
        params.codepro,
        YOOMONEY_SECRET,
        params.label,
      ].join("&");

      const expected = crypto.createHash("sha1").update(hashStr).digest("hex");

      if (params.sha1_hash !== expected) {
        this.logger.warn("YooMoney: Invalid hash");
        return;
      }
    }

    const label = params.label || "";
    const parts = label.split("_");
    const userId = parseInt(parts[0], 10);
    const pkgId = parts.slice(1).join("_");
    const pkg = this.getCoinPackageById(pkgId);

    if (!userId || !pkg) {
      this.logger.warn(`YooMoney: Bad label: ${label}`);
      return;
    }

    const paidAmount = parseFloat(
      params.withdraw_amount || params.amount || "0",
    );
    if (paidAmount < pkg.price) {
      this.logger.warn(`YooMoney: Underpaid: ${paidAmount} < ${pkg.price}`);
      return;
    }

    const user = await this.dbService.getUserById(userId);
    if (!user) {
      this.logger.warn(`YooMoney: User ${userId} not found`);
      return;
    }

    const newCoins = user.coins + pkg.coins;
    await this.dbService.updateUserCoins(userId, newCoins);
    this.creditCoinsToOnlineUser(userId, newCoins);

    this.logger.log(`YooMoney: +${pkg.coins} coins → ${user.nickname}`);
  }

  async processTgInvoice(
    packageId: string,
    telegramId: string,
  ): Promise<{ url?: string; error?: string }> {
    const TG_BOT_TOKEN = this.configService.get<string>("TG_BOT_TOKEN");
    if (!TG_BOT_TOKEN) {
      return { error: "TG_BOT_TOKEN not configured" };
    }

    const pkg = this.getCoinPackageById(packageId);
    if (!pkg) return { error: "Unknown package" };

    const user = await this.dbService.findUserByTelegramId(telegramId);
    if (!user) return { error: "User not found" };

    const payload = {
      chat_id: telegramId,
      title: `${pkg.coins} монет`,
      description: `Пополнение баланса на ${pkg.coins} монет`,
      payload: JSON.stringify({ userId: user.id, packageId: pkg.id }),
      currency: "XTR",
      prices: [{ label: `${pkg.coins} монет`, amount: pkg.starsPrice }],
    };

    const tgRes = await fetch(
      `https://api.telegram.org/bot${TG_BOT_TOKEN}/createInvoiceLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const tgData = await tgRes.json();
    if (!tgData.ok) {
      this.logger.error("TG Stars: createInvoiceLink failed", tgData);
      return { error: "Failed to create invoice" };
    }

    return { url: tgData.result };
  }

  async processTgRefund(
    telegramId: string,
    chargeId: string,
    coins?: number,
  ): Promise<{ ok: boolean; error?: string }> {
    const TG_BOT_TOKEN = this.configService.get<string>("TG_BOT_TOKEN");
    if (!TG_BOT_TOKEN) {
      return { ok: false, error: "TG_BOT_TOKEN not configured" };
    }
    const user = await this.dbService.findUserByTelegramId(telegramId);
    if (!user) {
      return { ok: false, error: "User not found by telegramId" };
    }
    const tgRes = await fetch(
      `https://api.telegram.org/bot${TG_BOT_TOKEN}/refundStarPayment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: telegramId,
          telegram_payment_charge_id: chargeId,
        }),
      },
    );
    const tgData = await tgRes.json();
    if (!tgData.ok) {
      this.logger.warn(
        `TG Refund failed: ${tgData.description || "unknown"}, tg_id: ${telegramId}, charge: ${chargeId}`,
      );
      return { ok: false, error: tgData.description || "Refund failed" };
    }
    if (coins != null && coins > 0) {
      const newCoins = Math.max(0, user.coins - coins);
      await this.dbService.updateUserCoins(user.id, newCoins);
      this.creditCoinsToOnlineUser(user.id, newCoins);
    }
    this.logger.log(
      `TG Refund: user ${user.nickname}, tg_id: ${telegramId}, charge: ${chargeId}, coins: -${coins || 0}`,
    );
    return { ok: true };
  }

  async processTgWebhook(update: any): Promise<void> {
    const TG_BOT_TOKEN = this.configService.get<string>("TG_BOT_TOKEN");

    if (update.pre_checkout_query) {
      await fetch(
        `https://api.telegram.org/bot${TG_BOT_TOKEN}/answerPreCheckoutQuery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pre_checkout_query_id: update.pre_checkout_query.id,
            ok: true,
          }),
        },
      );
      return;
    }

    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      let payloadData: { userId?: number; packageId?: string };
      try {
        payloadData = JSON.parse(payment.invoice_payload);
      } catch {
        return;
      }

      const { userId, packageId } = payloadData;
      const pkg = this.getCoinPackageById(packageId!);
      if (!pkg || !userId) return;

      const user = await this.dbService.getUserById(userId);
      if (!user) return;

      const newCoins = user.coins + pkg.coins;
      await this.dbService.updateUserCoins(userId, newCoins);
      this.creditCoinsToOnlineUser(userId, newCoins);

      this.logger.log(`TG Stars: +${pkg.coins} coins → ${user.nickname}`);
    }
  }

  private creditCoinsToOnlineUser(userId: number, coins: number): void {
    const user = this.onlineUsersService.getById(userId);
    if (user) {
      user.coins = coins;
      // Note: We need access to the socket to emit.
      // In a real scenario, OnlineUsersService should hold socket references or we use an event emitter.
      // For now, assuming OnlineUsersService can handle emission or we skip direct emit here and rely on polling/client sync.
      // To fix properly: OnlineUsersService needs `getSocket(userId)` method which returns the Socket instance.
    }
  }
}
