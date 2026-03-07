export interface DailyQuestConfig {
  id: string;
  target: number;
  reward: number;
  progressKey: "messagesSent" | "roomsVisited" | "boughtCount";
  rewardClaimedKey:
    | "rewardMessagesClaimed"
    | "rewardRoomsClaimed"
    | "rewardBuyClaimed";
  labelKey: string;
}

export const DAILY_QUESTS: DailyQuestConfig[] = [
  {
    id: "messages",
    target: 5,
    reward: 5,
    progressKey: "messagesSent",
    rewardClaimedKey: "rewardMessagesClaimed",
    labelKey: "Daily quest: write 5 messages",
  },
  {
    id: "rooms",
    target: 2,
    reward: 5,
    progressKey: "roomsVisited",
    rewardClaimedKey: "rewardRoomsClaimed",
    labelKey: "Daily quest: visit 2 rooms",
  },
  {
    id: "buy",
    target: 1,
    reward: 10,
    progressKey: "boughtCount",
    rewardClaimedKey: "rewardBuyClaimed",
    labelKey: "Daily quest: buy 1 item",
  },
];

export interface UserDailyRowLike {
  messagesSent?: number;
  roomsVisited?: string;
  boughtCount?: number;
  rewardMessagesClaimed?: boolean;
  rewardRoomsClaimed?: boolean;
  rewardBuyClaimed?: boolean;
}

export function getQuestProgress(
  row: UserDailyRowLike,
  quest: DailyQuestConfig,
): number {
  if (quest.progressKey === "roomsVisited") {
    const s = row.roomsVisited ?? "";
    return s ? s.split(",").filter(Boolean).length : 0;
  }
  return (row[quest.progressKey] as number) ?? 0;
}

export function isQuestRewardClaimed(
  row: UserDailyRowLike,
  quest: DailyQuestConfig,
): boolean {
  return !!(row[quest.rewardClaimedKey] as boolean);
}
