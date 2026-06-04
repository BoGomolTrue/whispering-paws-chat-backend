import { Logger, UseGuards } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { OnlineUsersService } from "../common/services/online-users.service";
import { NotificationsService } from "../notifications/notifications.service";
import { VALID_CATEGORIES } from "./shop.data.constant";
import { getShopTranslations } from "./shop.translations";
import { ShopService } from "./shop.service";

@WebSocketGateway()
@UseGuards(WsJwtGuard)
export class ShopGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ShopGateway.name);

  constructor(
    private shopService: ShopService,
    private onlineUsersService: OnlineUsersService,
    private notificationsService: NotificationsService,
  ) {}

  @SubscribeMessage("shop:list")
  handleShopList(@ConnectedSocket() client: Socket) {
    const items = this.shopService.getItems();
    client.emit("shop:list", items);
  }

  @SubscribeMessage("shop:translations")
  handleTranslations(
    @ConnectedSocket() client: Socket,
    @MessageBody() locale: 'en' | 'ru' = 'en',
  ) {
    const translations = getShopTranslations(locale);
    client.emit("shop:translations", translations);
  }

  @SubscribeMessage("shop:buy")
  async handleBuy(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: string | { itemId?: string; color?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("shop:error", "Guests cannot buy items");
      return;
    }

    const itemId = typeof data === "string" ? data : data?.itemId;
    const color = typeof data === "object" ? (data?.color ?? null) : null;

    if (!itemId) return;

    try {
      const result = await this.shopService.buyItem(user.id, itemId, color);
      client.emit("shop:bought", { itemId, coins: result.coins, color });
      if (!user.ownedItems.includes(itemId)) {
        user.ownedItems.push(itemId);
      }
    } catch (e) {
      client.emit("shop:error", e instanceof Error ? e.message : "Error");
    }
  }

  @SubscribeMessage("shop:sell")
  async handleSell(
    @ConnectedSocket() client: Socket,
    @MessageBody() itemId: string,
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("shop:error", "Guests cannot sell items");
      return;
    }
    if (typeof itemId !== "string") return;
    const item = this.shopService.getItemFromCache(itemId);
    const wasEquipped = item && user.equipped[item.category] === itemId;

    try {
      const result = await this.shopService.sellItem(user.id, itemId);
      client.emit("shop:sold", {
        itemId,
        coins: result.coins,
        refund: result.refund,
      });
      user.ownedItems = user.ownedItems.filter((id) => id !== itemId);
      if (wasEquipped && user.roomId) {
        client.to(`room:${user.roomId}`).emit("user:equip", {
          socketId: client.id,
          equipped: user.equipped,
          equippedColors: user.equippedColors,
        });
      }
    } catch (e) {
      client.emit("shop:error", e instanceof Error ? e.message : "Error");
    }
  }

  @SubscribeMessage("gift:send")
  async handleGiftSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { toUserId?: number; itemId?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || !data?.toUserId || !data?.itemId) return;
    if (data.toUserId === user.id) return;

    const recipient = this.onlineUsersService.getById(data.toUserId);
    if (!recipient) {
      client.emit("shop:error", "User not online");
      return;
    }

    try {
      const result = await this.shopService.giftPurchase(
        user.id,
        data.toUserId,
        data.itemId,
      );
      user.coins = result.coins;

      recipient.inventoryValue = this.shopService.calcInventoryValue(
        recipient.ownedItems,
      );

      const recipientSock = this.server.sockets.sockets.get(recipient.socketId);
      if (recipientSock) {
        recipientSock.emit("gift:received", {
          fromNickname: user.nickname,
          itemId: result.itemId,
          itemName: result.itemName,
          ownedItems: recipient.ownedItems,
          inventoryValue: recipient.inventoryValue,
        });
        void this.notificationsService.onGiftReceived(recipientSock, data.toUserId, {
          fromNickname: user.nickname,
          itemId: result.itemId,
          itemName: result.itemName,
          fromUserId: user.id,
        });
      }

      client.emit("gift:sent", {
        toUserId: data.toUserId,
        itemId: result.itemId,
        coins: result.coins,
      });

      if (user.roomId) {
        const giftText = `gifted ${recipient.nickname}: ${result.itemName}`;
        this.server.to(`room:${user.roomId}`).emit("chat:message", {
          msgId: Date.now(),
          socketId: "__system__",
          nickname: user.nickname,
          text: giftText,
          timestamp: Date.now(),
          gender: user.gender,
        });
      }
    } catch (e) {
      client.emit("shop:error", e instanceof Error ? e.message : "Error");
    }
  }

  @SubscribeMessage("equip")
  async handleEquip(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { category?: string; itemId?: string | null; color?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user) return;

    const { category, itemId, color } = data ?? {};
    if (
      typeof category !== "string" ||
      !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])
    ) {
      return;
    }

    try {
      const result = await this.shopService.equipItem(
        user.id,
        category,
        itemId ?? null,
        color ?? null,
      );
      if (user.roomId) {
        client.to(`room:${user.roomId}`).emit("user:equip", {
          socketId: client.id,
          equipped: result.equipped,
          equippedColors: result.equippedColors,
        });
      }
      user.equipped = result.equipped;
      user.equippedColors = result.equippedColors;
    } catch (e) {
      client.emit("shop:error", e instanceof Error ? e.message : "Error");
    }
  }
}
