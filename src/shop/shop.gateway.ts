import { Logger, UseGuards } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { Socket } from "socket.io";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { OnlineUsersService } from "../common/services/online-users.service";
import { VALID_CATEGORIES } from "./shop.data.constant";
import { ShopService } from "./shop.service";

@WebSocketGateway()
@UseGuards(WsJwtGuard)
export class ShopGateway {
  private readonly logger = new Logger(ShopGateway.name);

  constructor(
    private shopService: ShopService,
    private onlineUsersService: OnlineUsersService,
  ) {}

  @SubscribeMessage("shop:list")
  handleShopList(@ConnectedSocket() client: Socket) {
    const items = this.shopService.getItems();
    client.emit("shop:list", items);
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
