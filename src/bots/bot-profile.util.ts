import { Bot } from "../database/models/bot.model";
import { DEFAULT_STATUS_POOL } from "./bots.constants";

export type BotProfileInput = {
  nickname?: string;
  roomId?: number;
  characterType?: string;
  gender?: string;
  eyeColor?: string;
  status?: string;
  coins?: number;
  inventoryValue?: number;
  badges?: string[];
  ownedItems?: string[];
  equipped?: Record<
    string,
    { itemId: string; color: string | null } | undefined
  >;
  anketa_about?: string | null;
  anketa_city?: string | null;
  anketa_interests?: string | null;
  anketa_age?: string | null;
  anketa_looking_for?: string | null;
  statusPool?: string[];
};

export function normalizeBotProfileInput(raw: BotProfileInput) {
  return {
    nickname: raw.nickname?.trim(),
    roomId: raw.roomId,
    characterType: raw.characterType?.trim() || "cat",
    gender: raw.gender?.trim() || "female",
    eyeColor: raw.eyeColor?.trim() || "#8E44AD",
    status: raw.status?.trim() ?? "",
    coins: Number.isFinite(raw.coins)
      ? Math.max(0, Math.floor(raw.coins!))
      : 100,
    inventoryValue: Number.isFinite(raw.inventoryValue)
      ? Math.max(0, Math.floor(raw.inventoryValue!))
      : 0,
    badges: Array.isArray(raw.badges) ? raw.badges.filter(Boolean) : [],
    ownedItems: Array.isArray(raw.ownedItems)
      ? raw.ownedItems.filter(Boolean)
      : [],
    equipped:
      raw.equipped && typeof raw.equipped === "object" ? raw.equipped : {},
    anketa_about: raw.anketa_about?.trim() || null,
    anketa_city: raw.anketa_city?.trim() || null,
    anketa_interests: raw.anketa_interests?.trim() || null,
    anketa_age: raw.anketa_age?.trim() || null,
    anketa_looking_for: raw.anketa_looking_for?.trim() || null,
    statusPool:
      Array.isArray(raw.statusPool) && raw.statusPool.length > 0
        ? raw.statusPool
        : DEFAULT_STATUS_POOL,
  };
}

export function botRowToProfileFields(row: Bot) {
  return {
    status: row.status ?? "",
    coins: row.coins ?? 100,
    inventoryValue: row.inventoryValue ?? 0,
    badges: row.badges ?? [],
    ownedItems: row.ownedItems ?? [],
    equipped: row.equipped ?? {},
    anketa_about: row.anketa_about ?? undefined,
    anketa_city: row.anketa_city ?? undefined,
    anketa_interests: row.anketa_interests ?? undefined,
    anketa_age: row.anketa_age ?? undefined,
    anketa_looking_for: row.anketa_looking_for ?? undefined,
    statusPool:
      Array.isArray(row.statusPool) && row.statusPool.length > 0
        ? row.statusPool
        : DEFAULT_STATUS_POOL,
  };
}
