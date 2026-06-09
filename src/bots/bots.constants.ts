export const DEFAULT_STATUS_POOL = ["", "тут", "скучно", "brb"];

export const BOT_RUNTIME_DEFAULTS = {
  role: "user",
  emotion: "neutral",
  invisible: false,
  notificationsOff: false,
  animationsOff: false,
} as const;

export interface BotInstance {
  id: number;
  socketId: string;
  nickname: string;
  characterType: string;
  gender: string;
  eyeColor: string;
  roomId: number;
  x: number;
  y: number;
  equipped: Record<
    string,
    { itemId: string; color: string | null } | undefined
  >;
  ownedItems: string[];
  coins: number;
  inventoryValue: number;
  status: string;
  badges: string[];
  anketa_about?: string;
  anketa_city?: string;
  anketa_interests?: string;
  anketa_age?: string;
  anketa_looking_for?: string;
  statusPool: string[];
  role: string;
  emotion: string;
  invisible: boolean;
  notificationsOff: boolean;
  animationsOff: boolean;
}
