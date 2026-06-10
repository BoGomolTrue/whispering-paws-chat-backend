export const BADGE_IDS = [
  "first_message",
  "messages_10",
  "streak_7",
  "first_friend",
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

export const BADGE_LABEL_KEYS: Record<BadgeId, string> = {
  first_message: "Badge: first message",
  messages_10: "Badge: 10 messages",
  streak_7: "Badge: 7 day streak",
  first_friend: "Badge: first friend",
};

export const STARTER_QUEST_REWARD = 100;
