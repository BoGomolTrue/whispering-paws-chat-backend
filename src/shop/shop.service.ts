import { Injectable } from "@nestjs/common";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseService } from "../database/database.service";
import {
  getShopItemById,
  getShopItemsForClient,
  applyEffectivePrice,
} from "./shop.data.constant";

@Injectable()
export class ShopService {
  constructor(
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
  ) {}

  getItems() {
    return getShopItemsForClient();
  }

  getItemFromCache(itemId: string) {
    const item = getShopItemById(itemId);
    return item ? applyEffectivePrice(item) : null;
  }

  calcInventoryValue(ownedItems: string[]): number {
    let v = 0;
    for (const id of ownedItems) {
      const it = this.getItemFromCache(id);
      if (it) v += it.price;
    }
    return v;
  }

  async buyItem(userId: number, itemId: string, color: string | null) {
    const user = this.onlineUsersService.getById(userId);
    if (!user) throw new Error("User not online");

    const item = this.getItemFromCache(itemId);
    if (!item) throw new Error("Item not found");
    if (user.ownedItems.includes(itemId)) throw new Error("Already owned");
    const price = item.effectivePrice ?? item.price;
    if (user.coins < price) throw new Error("Not enough coins");

    user.coins -= price;
    user.ownedItems.push(itemId);
    user.inventoryValue = this.calcInventoryValue(user.ownedItems);

    await this.dbService.updateUserCoins(userId, user.coins);
    await this.dbService.addOwnedItem(userId, itemId);
    await this.dbService.incDailyBought(userId);

    return { coins: user.coins, itemId, color };
  }

  async sellItem(userId: number, itemId: string) {
    const user = this.onlineUsersService.getById(userId);
    if (!user) throw new Error("User not online");
    if (!user.ownedItems.includes(itemId)) throw new Error("Item not owned");

    const item = getShopItemById(itemId);
    if (!item) throw new Error("Item not found");

    const sellPercent = await this.dbService.getSettingNumber(
      "sell_percent",
      50,
    );
    const refund = Math.round((item.price * sellPercent) / 100);

    // Unequip if equipped
    if (user.equipped[item.category] === itemId) {
      user.equipped[item.category] = null;
      user.equippedColors[item.category] = null;
      await this.dbService.unequipItem(userId, item.category);
    }

    user.ownedItems = user.ownedItems.filter((id) => id !== itemId);
    user.coins += refund;
    user.inventoryValue = this.calcInventoryValue(user.ownedItems);

    await this.dbService.removeOwnedItem(userId, itemId);
    await this.dbService.updateUserCoins(userId, user.coins);

    return { coins: user.coins, refund, itemId };
  }

  async equipItem(
    userId: number,
    category: string,
    itemId: string | null,
    color: string | null,
  ) {
    const user = this.onlineUsersService.getById(userId);
    if (!user) throw new Error("User not online");

    if (itemId === null) {
      user.equipped[category] = null;
      user.equippedColors[category] = null;
      await this.dbService.unequipItem(userId, category);
      return { equipped: user.equipped, equippedColors: user.equippedColors };
    }

    if (!user.ownedItems.includes(itemId)) throw new Error("Item not owned");

    const item = getShopItemById(itemId);
    if (!item || item.category !== category)
      throw new Error("Invalid item category");

    user.equipped[category] = itemId;
    user.equippedColors[category] = color;

    await this.dbService.equipItem(userId, category, itemId, color);

    return { equipped: user.equipped, equippedColors: user.equippedColors };
  }
}
