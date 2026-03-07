export interface BotProfile {
  id: number;
  socketId: string;
  nickname: string;
  characterType: string;
  gender: string;
  eyeColor: string;
  equipped: Record<
    string,
    { itemId: string; color: string | null } | undefined
  >;
  ownedItems: string[];
  coins: number;
  role: string;
  status: string;
  invisible: boolean;
  emotion: string;
  isBot: true;
  lastSalaryAt: number;
  salaryClaimCount: number;
  inventoryValue: number;
  notificationsOff: boolean;
  animationsOff: boolean;
}

export const BOT_PROFILES: BotProfile[] = [
  {
    id: -1,
    socketId: "bot_1",
    nickname: "милашка🌙",
    characterType: "cat",
    gender: "female",
    eyeColor: "#8E44AD",
    equipped: {
      hats: { itemId: "crown_gold", color: null },
      bottom: { itemId: "bottom_baggy", color: "#e91e63" },
    },
    ownedItems: ["crown_gold", "bottom_baggy"],
    coins: 210,
    role: "user",
    status: "💅 шоппинг",
    invisible: false,
    emotion: "neutral",
    isBot: true,
    lastSalaryAt: 0,
    salaryClaimCount: 0,
    inventoryValue: 110,
    notificationsOff: false,
    animationsOff: false,
  },
  {
    id: -2,
    socketId: "bot_2",
    nickname: "kira",
    characterType: "fox",
    gender: "female",
    eyeColor: "#E74C3C",
    equipped: { shoes: { itemId: "shoes_converse", color: "#c62828" } },
    ownedItems: ["shoes_converse"],
    coins: 130,
    role: "user",
    status: "",
    invisible: false,
    emotion: "neutral",
    isBot: true,
    lastSalaryAt: 0,
    salaryClaimCount: 0,
    inventoryValue: 30,
    notificationsOff: false,
    animationsOff: false,
  },
  {
    id: -3,
    socketId: "bot_3",
    nickname: "дашуля🌸",
    characterType: "panda",
    gender: "female",
    eyeColor: "#3498DB",
    equipped: {
      hats: { itemId: "hat_cpcompany", color: "#607d8b" },
      bottom: { itemId: "bottom_baggy", color: "#1565c0" },
    },
    ownedItems: ["hat_cpcompany", "bottom_baggy"],
    coins: 190,
    role: "user",
    status: "📚 сессия...",
    invisible: false,
    emotion: "neutral",
    isBot: true,
    lastSalaryAt: 0,
    salaryClaimCount: 0,
    inventoryValue: 95,
    notificationsOff: false,
    animationsOff: false,
  },
  {
    id: -4,
    socketId: "bot_4",
    nickname: "лерочка",
    characterType: "raccoon",
    gender: "female",
    eyeColor: "#27AE60",
    equipped: { shoes: { itemId: "shoes_sneakers", color: null } },
    ownedItems: ["shoes_sneakers"],
    coins: 80,
    role: "user",
    status: "🎧 музыка",
    invisible: false,
    emotion: "neutral",
    isBot: true,
    lastSalaryAt: 0,
    salaryClaimCount: 0,
    inventoryValue: 40,
    notificationsOff: false,
    animationsOff: false,
  },
  {
    id: -5,
    socketId: "bot_5",
    nickname: "аня♡",
    characterType: "dog",
    gender: "female",
    eyeColor: "#F39C12",
    equipped: { shoes: { itemId: "shoes_boots", color: "#5d4037" } },
    ownedItems: ["shoes_boots"],
    coins: 65,
    role: "user",
    status: "",
    invisible: false,
    emotion: "neutral",
    isBot: true,
    lastSalaryAt: 0,
    salaryClaimCount: 0,
    inventoryValue: 35,
    notificationsOff: false,
    animationsOff: false,
  },
];

export interface BotInstance extends BotProfile {
  x: number;
  y: number;
  roomId: number;
}
