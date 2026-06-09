import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { randomBytes } from "crypto";
import { Op } from "sequelize";
import { STARTER_QUEST_REWARD } from "../achievements/achievements.config";
import { BotProfileInput, normalizeBotProfileInput } from "../bots/bot-profile.util";
import {
  DAILY_QUESTS,
  getQuestProgress,
  isQuestRewardClaimed,
} from "../daily/daily-quests.config";
import { Bot } from "./models/bot.model";
import { AdminLog } from "./models/admin-log.model";
import { UserLog } from "./models/user-log.model";
import { UserFriend } from "./models/user-friend.model";
import { ProfilePost } from "./models/profile-post.model";
import { ProfilePostComment } from "./models/profile-post-comment.model";
import { ChatMessage } from "./models/chat-message.model";
import { DirectMessage } from "./models/direct-message.model";
import { Notification } from "./models/notification.model";
import { Rank } from "./models/rank.model";
import { Room } from "./models/room.model";
import { Setting } from "./models/settings.model";
import { UserDaily } from "./models/user-daily.model";
import { UserEquipped } from "./models/user-equipped.model";
import { UserItem } from "./models/user-item.model";
import { User } from "./models/user.model";
import { getShopItemById } from "../shop/shop.data.constant";

export interface DbUserRow {
  id: number;
  nickname: string;
  coins: number;
  role: string;
  banned?: boolean;
  ownedItems: string[];
  equipped: Record<string, string | null>;
  equippedColors: Record<string, string | null>;
  characterType: string;
  gender: string | null;
  eyeColor: string | null;
  status: string | null;
  lastRoomId: number | null;
  lastSalaryAt: number;
  salaryClaimCount: number;
  totalSpent?: number;
  invisible?: boolean;
  notificationsOff?: boolean;
  animationsOff?: boolean;
  vkId?: number;
  telegramId?: string;
  password?: string;
  isGuest?: boolean;
  anketa_about?: string | null;
  anketa_city?: string | null;
  anketa_interests?: string | null;
  anketa_looking_for?: string | null;
  anketa_age?: string | null;
  anketa_avatar?: string | null;
  referralCode?: string | null;
  referredBy?: number | null;
  referralBonusPaid?: boolean;
  badges?: string[];
  starterQuestStep?: number;
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectModel(User) private userRepository: typeof User,
    @InjectModel(UserItem) private userItemRepository: typeof UserItem,
    @InjectModel(UserEquipped)
    private userEquippedRepository: typeof UserEquipped,
    @InjectModel(Room) private roomRepository: typeof Room,
    @InjectModel(ChatMessage) private chatMessageRepository: typeof ChatMessage,
    @InjectModel(DirectMessage)
    private directMessageRepository: typeof DirectMessage,
    @InjectModel(Setting) private settingRepository: typeof Setting,
    @InjectModel(Rank) private rankRepository: typeof Rank,
    @InjectModel(UserDaily) private userDailyRepository: typeof UserDaily,
    @InjectModel(Notification)
    private notificationRepository: typeof Notification,
    @InjectModel(Bot) private botRepository: typeof Bot,
    @InjectModel(AdminLog) private adminLogRepository: typeof AdminLog,
    @InjectModel(UserLog) private userLogRepository: typeof UserLog,
    @InjectModel(UserFriend) private userFriendRepository: typeof UserFriend,
    @InjectModel(ProfilePost) private profilePostRepository: typeof ProfilePost,
    @InjectModel(ProfilePostComment)
    private profilePostCommentRepository: typeof ProfilePostComment,
  ) {}

  async onModuleInit() {
    await this.seedSettings();
    await this.seedRanks();
    await this.ensureDefaultRoom();
    await this.ensureGuestRoom();
  }

  async loadUserForSocket(userId: number): Promise<DbUserRow | null> {
    const user = await this.userRepository.findByPk(userId, {
      include: [
        { model: UserItem, as: "items" },
        { model: UserEquipped, as: "equipped" },
      ],
    });
    if (!user) return null;

    const u = user.get({ plain: true }) as any;
    const ownedItems = u.items?.map((i: any) => i.itemId) || [];

    const equipped: Record<string, string | null> = {
      effects: null,
      hats: null,
      hair: null,
      masks: null,
      chains: null,
      tattoo: null,
      bottom: null,
      tops: null,
      shoes: null,
      clothing: null,
      transport: null,
      items: null,
      vehicles: null,
      tattoos: null,
      glasses: null,
    };
    const equippedColors: Record<string, string | null> = { ...equipped };

    u.equipped?.forEach((e: any) => {
      equipped[e.category] = e.itemId;
      equippedColors[e.category] = e.color || null;
    });

    return {
      id: u.id,
      nickname: u.nickname,
      coins: u.coins,
      ownedItems,
      equipped,
      equippedColors,
      eyeColor: u.eyeColor,
      characterType: u.characterType,
      gender: u.gender,
      lastSalaryAt: Number(u.lastSalaryAt) || 0,
      salaryClaimCount: u.salaryClaimCount || 0,
      totalSpent: u.totalSpent || 0,
      notificationsOff: u.notificationsOff || false,
      animationsOff: u.animationsOff || false,
      role: u.role || "user",
      status: u.status || "",
      banned: u.banned || false,
      invisible: u.invisible || false,
      lastRoomId: u.lastRoomId,
      isGuest: u.isGuest || false,
      anketa_about: u.anketa_about,
      anketa_city: u.anketa_city,
      anketa_interests: u.anketa_interests,
      anketa_looking_for: u.anketa_looking_for,
      anketa_age: u.anketa_age,
      anketa_avatar: u.anketa_avatar,
      badges: Array.isArray(u.badges) ? u.badges : [],
      starterQuestStep: u.starterQuestStep ?? 0,
    };
  }

  parseBadges(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
    return [];
  }

  async getUserBadges(userId: number): Promise<string[]> {
    const row = await this.userRepository.findByPk(userId, {
      attributes: ["badges"],
      raw: true,
    });
    if (!row) return [];
    return this.parseBadges((row as any).badges);
  }

  async grantBadge(userId: number, badgeId: string): Promise<string[] | null> {
    const badges = await this.getUserBadges(userId);
    if (badges.includes(badgeId)) return null;
    const next = [...badges, badgeId];
    await this.userRepository.update(
      { badges: next },
      { where: { id: userId } },
    );
    return next;
  }

  async revokeBadge(userId: number, badgeId: string): Promise<string[] | null> {
    const badges = await this.getUserBadges(userId);
    if (!badges.includes(badgeId)) return null;
    const next = badges.filter((b) => b !== badgeId);
    await this.userRepository.update(
      { badges: next },
      { where: { id: userId } },
    );
    return next;
  }

  async onStarterQuestJoined(userId: number): Promise<number> {
    const row = await this.userRepository.findByPk(userId, {
      attributes: ["starterQuestStep"],
      raw: true,
    });
    const step = (row as any)?.starterQuestStep ?? 0;
    if (!row || step >= 1) return step;
    await this.userRepository.update(
      { starterQuestStep: 1 },
      { where: { id: userId } },
    );
    return 1;
  }

  async onStarterQuestFirstMessage(
    userId: number,
  ): Promise<{ step: number; coins: number; badges: string[] } | null> {
    const row = await this.userRepository.findByPk(userId, {
      attributes: ["starterQuestStep", "coins"],
      raw: true,
    });
    if (!row || (row as any).starterQuestStep !== 1) return null;
    const newCoins = ((row as any).coins ?? 0) + STARTER_QUEST_REWARD;
    let badges = await this.getUserBadges(userId);
    if (!badges.includes("first_message")) {
      badges = [...badges, "first_message"];
    }
    await this.userRepository.update(
      { starterQuestStep: 3, coins: newCoins, badges },
      { where: { id: userId } },
    );
    return { step: 3, coins: newCoins, badges };
  }

  async findUserByVkId(vkId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { vkId } });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findUserByNickname(nickname: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { nickname } });
  }

  async findUserByTelegramId(telegramId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { telegramId } });
  }

  async createUser(data: {
    email: string;
    password: string;
    nickname: string;
    characterType?: string;
    gender?: string;
    vkId?: number;
    telegramId?: string;
  }): Promise<User> {
    const startingCoins = await this.getSettingNumber("starting_coins", 100);
    const referralCode = randomBytes(5).toString("hex").toUpperCase();
    return this.userRepository.create({
      email: data.email,
      password: data.password,
      nickname: data.nickname,
      characterType: data.characterType || "cat",
      gender: data.gender || "male",
      coins: startingCoins,
      vkId: data.vkId ?? null,
      telegramId: data.telegramId ?? null,
      referralCode,
    } as any);
  }

  async getUserById(userId: number): Promise<DbUserRow | null> {
    const user = await this.userRepository.findByPk(userId, { raw: true });
    return user as unknown as DbUserRow | null;
  }

  async updateUserCoins(userId: number, coins: number): Promise<void> {
    await this.userRepository.update({ coins }, { where: { id: userId } });
  }

  async updateCoins(userId: number, coins: number): Promise<void> {
    await this.updateUserCoins(userId, coins);
  }

  async updateNickname(userId: number, nickname: string): Promise<void> {
    await this.userRepository.update({ nickname }, { where: { id: userId } });
  }

  async banUser(userId: number): Promise<void> {
    await this.userRepository.update(
      { banned: true },
      { where: { id: userId } },
    );
  }

  async unbanUser(userId: number): Promise<boolean> {
    const user = await this.userRepository.findByPk(userId);
    if (!user) return false;
    await user.update({ banned: false });
    return true;
  }

  async setInvisible(userId: number, invisible: boolean): Promise<void> {
    await this.userRepository.update({ invisible }, { where: { id: userId } });
  }

  async changePassword(userId: number, hashedPassword: string): Promise<void> {
    await this.userRepository.update(
      { password: hashedPassword },
      { where: { id: userId } },
    );
  }

  async updateUserProfile(
    userId: number,
    data: Partial<Record<string, unknown>>,
  ): Promise<void> {
    await this.userRepository.update(data, { where: { id: userId } });
  }

  async updateSalary(
    userId: number,
    lastSalaryAt: number,
    salaryClaimCount: number,
  ): Promise<void> {
    await this.userRepository.update(
      { lastSalaryAt, salaryClaimCount },
      { where: { id: userId } },
    );
  }

  async addTotalSpent(userId: number, amount: number): Promise<void> {
    await this.userRepository.increment("totalSpent", {
      by: amount,
      where: { id: userId },
    });
  }

  async addOwnedItem(userId: number, itemId: string): Promise<void> {
    await this.userItemRepository.findOrCreate({ where: { userId, itemId } });
  }

  async removeOwnedItem(userId: number, itemId: string): Promise<void> {
    await this.userItemRepository.destroy({ where: { userId, itemId } });
  }

  async equipItem(
    userId: number,
    category: string,
    itemId: string,
    color: string | null,
  ): Promise<void> {
    await this.userEquippedRepository.upsert({
      userId,
      category,
      itemId,
      color,
    } as any);
  }

  async unequipItem(userId: number, category: string): Promise<void> {
    await this.userEquippedRepository.destroy({ where: { userId, category } });
  }

  async createRoom(
    name: string,
    creatorId: number,
    photoUrl: string | null = null,
    description: string | null = null,
  ): Promise<Room> {
    return this.roomRepository.create({
      name,
      creatorId,
      photoUrl,
      description,
    } as any);
  }

  async updateRoom(
    roomId: number,
    data: {
      name?: string;
      photoUrl?: string | null;
      description?: string | null;
      passwordHash?: string | null;
    },
  ): Promise<Room | null> {
    const room = await this.getRoomById(roomId);
    if (!room) return null;
    await this.roomRepository.update(data, { where: { id: roomId } });
    return this.getRoomById(roomId);
  }

  async getRooms(): Promise<Room[]> {
    return this.roomRepository.findAll({ order: [["createdAt", "DESC"]] });
  }

  async getRoomById(roomId: number): Promise<Room | null> {
    return this.roomRepository.findByPk(roomId);
  }

  async deleteRoom(roomId: number): Promise<void> {
    await this.roomRepository.destroy({ where: { id: roomId } });
  }

  async updateLastRoomId(userId: number, roomId: number): Promise<void> {
    await this.userRepository.update(
      { lastRoomId: roomId },
      { where: { id: userId } },
    );
  }

  async ensureDefaultRoom(): Promise<Room> {
    const [room] = await this.roomRepository.findOrCreate({
      where: { name: "General Room" },
      defaults: { name: "General Room", creatorId: null, maxUsers: -1 } as any,
    });
    return room;
  }

  async ensureGuestRoom(): Promise<Room> {
    const [room] = await this.roomRepository.findOrCreate({
      where: { name: "Guest Room" },
      defaults: { name: "Guest Room", creatorId: null, maxUsers: -1 } as any,
    });
    return room;
  }

  async getDefaultRoomId(): Promise<number> {
    const room = await this.roomRepository.findOne({
      where: { name: "General Room" },
    });
    return room ? room.id : (await this.ensureDefaultRoom()).id;
  }

  async getGuestRoomId(): Promise<number> {
    const room = await this.roomRepository.findOne({
      where: { name: "Guest Room" },
    });
    return room ? room.id : (await this.ensureGuestRoom()).id;
  }

  async saveChatMessage(data: {
    roomId: number;
    userId: number | null;
    nickname: string;
    text: string;
    gender: string | null;
    isSystem: boolean;
  }): Promise<{ id: number }> {
    const msg = await this.chatMessageRepository.create({
      ...data,
      timestamp: Date.now(),
    } as any);
    return { id: msg.id };
  }

  async getChatStyleSamples(limit = 30): Promise<string[]> {
    const rows = await this.chatMessageRepository.findAll({
      where: {
        isSystem: false,
        userId: { [Op.ne]: null },
      },
      order: [["timestamp", "DESC"]],
      limit: Math.max(limit * 4, 80),
      attributes: ["text"],
      raw: true,
    });
    const skip = /^(gifted |joined |left$|padded |wandered |changed )/i;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of rows as { text: string }[]) {
      const text = row.text?.trim();
      if (!text || text.length < 2 || text.length > 100) continue;
      if (skip.test(text)) continue;
      if (text.includes("?")) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
      if (out.length >= limit) break;
    }
    return out;
  }

  async getRoomMessages(roomId: number, limit = 50): Promise<any[]> {
    const rows = await this.chatMessageRepository.findAll({
      where: { roomId },
      order: [["timestamp", "DESC"]],
      limit,
      raw: true,
    });
    return (rows as any[]).reverse().map((r) => ({
      msgId: r.id,
      socketId: r.isSystem ? "__system__" : "",
      userId: r.userId,
      nickname: r.nickname,
      text: r.text,
      timestamp: parseInt(r.timestamp, 10),
      gender: r.gender || undefined,
    }));
  }

  async deleteChatMessage(msgId: number): Promise<void> {
    await this.chatMessageRepository.destroy({ where: { id: msgId } });
  }

  async clearRoomChat(roomId: number): Promise<void> {
    await this.chatMessageRepository.destroy({ where: { roomId } });
  }

  // === DIRECT MESSAGES ===
  async saveDirectMessage(
    fromUserId: number,
    toUserId: number,
    text: string,
  ): Promise<{ id: number; timestamp: string }> {
    const msg = await this.directMessageRepository.create({
      fromUserId,
      toUserId,
      text,
      timestamp: Date.now(),
    } as any);
    return { id: msg.id, timestamp: String(msg.timestamp) };
  }

  async getDirectMessages(
    userA: number,
    userB: number,
    limit = 50,
  ): Promise<any[]> {
    const rows = await this.directMessageRepository.findAll({
      where: {
        [Op.or]: [
          { fromUserId: userA, toUserId: userB },
          { fromUserId: userB, toUserId: userA },
        ],
      },
      order: [["timestamp", "DESC"]],
      limit,
      raw: true,
    });
    return (rows as any[]).reverse();
  }

  async markDmRead(userId: number): Promise<void> {
    await this.userRepository.update(
      { dmLastReadAt: Date.now() },
      { where: { id: userId } },
    );
  }

  async getLastDmFrom(userId: number): Promise<number | null> {
    const user = await this.userRepository.findByPk(userId, {
      attributes: ["dmLastReadAt"],
      raw: true,
    });
    const lastRead = parseInt((user as any)?.dmLastReadAt || "0", 10);

    const msg = await this.directMessageRepository.findOne({
      where: {
        toUserId: userId,
        timestamp: { [Op.gt]: lastRead },
      },
      order: [["timestamp", "DESC"]],
      raw: true,
    });
    return msg ? (msg as any).fromUserId : null;
  }

  async seedSettings(): Promise<void> {
    const defaults = [
      {
        key: "sell_percent",
        value: "50",
        label: "Процент возврата",
        type: "number",
      },
      {
        key: "starting_coins",
        value: "100",
        label: "Стартовые монеты",
        type: "number",
      },
      {
        key: "default_max_room_users",
        value: "20",
        label: "Макс. пользователей",
        type: "number",
      },
      {
        key: "chat_max_length",
        value: "500",
        label: "Макс. длина сообщения",
        type: "number",
      },
      {
        key: "max_nickname_length",
        value: "20",
        label: "Макс. длина никнейма",
        type: "number",
      },
    ];
    for (const s of defaults) {
      await this.settingRepository.findOrCreate({
        where: { key: s.key },
        defaults: s as any,
      });
    }
  }

  async getSetting(key: string): Promise<string | null> {
    const setting = await this.settingRepository.findByPk(key);
    return setting ? (setting as any).value : null;
  }

  async getSettingNumber(key: string, fallback = 0): Promise<number> {
    const val = await this.getSetting(key);
    return val !== null ? parseInt(val, 10) : fallback;
  }

  async getAllSettings(): Promise<any[]> {
    return this.settingRepository.findAll({ raw: true });
  }

  async seedRanks(): Promise<void> {
    const ranks = [
      { min: 0, name: "Young Fluff" },
      { min: 100, name: "Curious Snout" },
      { min: 250, name: "Paw Student" },
      { min: 500, name: "Yard Regular" },
      { min: 750, name: "Known Face" },
      { min: 1500, name: "Cushion Boss" },
      { min: 3000, name: "Wise Fluff" },
      { min: 5000, name: "Stash Keeper" },
      { min: 7000, name: "Velvet Paw" },
      { min: 10000, name: "Star Fluff" },
      { min: 15000, name: "Bowl Lord" },
      { min: 25000, name: "Golden Tail" },
      { min: 35000, name: "Chief Purrer" },
      { min: 50000, name: "Feeder Legend" },
      { min: 75000, name: "Great Fluff" },
      { min: 100000, name: "Fairy Beast" },
      { min: 175000, name: "Forest Legend" },
      { min: 250000, name: "Paw Emperor" },
      { min: 350000, name: "Paw Guardian" },
      { min: 500000, name: "Purr Titan" },
      { min: 750000, name: "Purr Demigod" },
      { min: 1000000, name: "Supreme Fluff" },
    ];
    for (const r of ranks) {
      const [row, created] = await this.rankRepository.findOrCreate({
        where: { min: r.min },
        defaults: r as any,
      });
      if (!created && row.name !== r.name) {
        await row.update({ name: r.name });
      }
    }
  }

  async getRanks(): Promise<any[]> {
    return this.rankRepository.findAll({ order: [["min", "ASC"]], raw: true });
  }

  private getTodayUtc(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async getOrCreateDaily(userId: number, day: string): Promise<any> {
    const [row] = await this.userDailyRepository.findOrCreate({
      where: { userId, day },
      defaults: {
        userId,
        day,
        messagesSent: 0,
        roomsVisited: "",
        boughtCount: 0,
        rewardMessagesClaimed: false,
        rewardRoomsClaimed: false,
        rewardBuyClaimed: false,
      } as any,
    });
    return row;
  }

  async incDailyMessages(userId: number): Promise<void> {
    const day = this.getTodayUtc();
    const row = await this.getOrCreateDaily(userId, day);
    await this.userDailyRepository.update(
      { messagesSent: row.messagesSent + 1 },
      { where: { userId, day } },
    );
  }

  async addDailyRoom(userId: number, roomId: number): Promise<void> {
    const day = this.getTodayUtc();
    const row = await this.getOrCreateDaily(userId, day);
    const ids = row.roomsVisited
      ? row.roomsVisited.split(",").filter(Boolean)
      : [];
    if (!ids.includes(String(roomId))) {
      ids.push(String(roomId));
      await this.userDailyRepository.update(
        { roomsVisited: ids.join(",") },
        { where: { userId, day } },
      );
    }
  }

  async incDailyBought(userId: number): Promise<void> {
    const day = this.getTodayUtc();
    const row = await this.getOrCreateDaily(userId, day);
    await this.userDailyRepository.update(
      { boughtCount: row.boughtCount + 1 },
      { where: { userId, day } },
    );
  }

  async getDailyState(userId: number): Promise<any> {
    const today = this.getTodayUtc();
    const [streak, daily] = await Promise.all([
      this.getStreak(userId),
      this.getOrCreateDaily(userId, today),
    ]);

    const quests = DAILY_QUESTS.map((q) => {
      const progress = getQuestProgress(daily, q);
      const completed = progress >= q.target;
      const rewardClaimed = isQuestRewardClaimed(daily, q);
      return {
        id: q.id,
        progress,
        target: q.target,
        completed,
        rewardClaimed,
        reward: q.reward,
        labelKey: q.labelKey,
      };
    });

    return {
      day: today,
      streakDays: streak.streakDays,
      streakClaimedToday: streak.lastDate === today,
      quests,
    };
  }

  async getStreak(
    userId: number,
  ): Promise<{ streakDays: number; lastDate: string | null }> {
    const row = await this.userRepository.findByPk(userId, {
      attributes: ["streak_last_date", "streak_days"],
      raw: true,
    });
    if (!row) return { streakDays: 0, lastDate: null };
    return {
      streakDays: (row as any).streak_days || 0,
      lastDate: (row as any).streak_last_date || null,
    };
  }

  async claimStreak(
    userId: number,
  ): Promise<{ coins: number; streakDays: number; badges: string[] } | null> {
    const today = this.getTodayUtc();
    const row = await this.userRepository.findByPk(userId, {
      attributes: ["streak_last_date", "streak_days", "coins"],
      raw: true,
    });
    if (!row) return null;

    const last = (row as any).streak_last_date || "";
    let streakDays = (row as any).streak_days || 0;

    if (last === today) return null;

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (last !== yesterdayStr && last !== "") streakDays = 0;
    streakDays += 1;

    const baseCoins = 5;
    const coins = baseCoins + streakDays * 2;

    await this.userRepository.update(
      {
        streak_last_date: today,
        streak_days: streakDays,
        coins: (row as any).coins + coins,
      },
      { where: { id: userId } },
    );

    let badges: string[] | null = null;
    if (streakDays >= 7) {
      badges = await this.grantBadge(userId, "streak_7");
    }

    return {
      coins: (row as any).coins + coins,
      streakDays,
      badges: badges ?? (await this.getUserBadges(userId)),
    };
  }

  async hasIncomingDm(fromUserId: number, toUserId: number): Promise<boolean> {
    const count = await this.directMessageRepository.count({
      where: { fromUserId, toUserId },
    });
    return count > 0;
  }

  async countUserChatMessages(userId: number): Promise<number> {
    return this.chatMessageRepository.count({
      where: { userId, isSystem: false },
    });
  }

  async claimQuestReward(
    userId: number,
    questId: string,
  ): Promise<{ coins: number } | null> {
    const day = this.getTodayUtc();
    const daily = await this.getOrCreateDaily(userId, day);
    const q = DAILY_QUESTS.find((x) => x.id === questId);
    if (!q) return null;
    if (isQuestRewardClaimed(daily, q)) return null;

    const progress = getQuestProgress(daily, q);
    if (progress < q.target) return null;

    const user = await this.userRepository.findByPk(userId, {
      attributes: ["coins"],
      raw: true,
    });
    if (!user) return null;

    const newCoins = (user as any).coins + q.reward;
    await this.userRepository.update(
      { coins: newCoins },
      { where: { id: userId } },
    );
    await this.userDailyRepository.update(
      { [q.rewardClaimedKey]: true },
      { where: { userId, day } },
    );

    return { coins: newCoins };
  }

  async updateRoomBackground(
    roomId: number,
    backgroundType: string,
    weather: string,
  ): Promise<void> {
    await this.roomRepository.update(
      { backgroundType, weather },
      { where: { id: roomId } },
    );
  }

  async getNotifications(userId: number, limit = 50) {
    const rows = await this.notificationRepository.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit,
    });
    return rows.map((row) => {
      const plain = row.get({ plain: true }) as any;
      return {
        id: plain.id,
        type: plain.type,
        payload: plain.payload ?? {},
        read: plain.read,
        createdAt: new Date(plain.createdAt).getTime(),
      };
    });
  }

  async getUnreadNotificationCount(userId: number): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, read: false },
    });
  }

  async findUnreadNotification(userId: number, type: string) {
    return this.notificationRepository.findOne({
      where: { userId, type, read: false },
    });
  }

  async createNotification(
    userId: number,
    type: string,
    payload: Record<string, unknown> = {},
  ) {
    const row = await this.notificationRepository.create({
      userId,
      type,
      payload,
      read: false,
    } as any);
    const plain = row.get({ plain: true }) as any;
    return {
      id: plain.id,
      type: plain.type,
      payload: plain.payload ?? {},
      read: plain.read,
      createdAt: new Date(plain.createdAt).getTime(),
    };
  }

  async getNotificationById(id: number, userId: number) {
    const row = await this.notificationRepository.findOne({
      where: { id, userId },
    });
    if (!row) return null;
    const plain = row.get({ plain: true }) as any;
    return {
      id: plain.id,
      type: plain.type,
      payload: plain.payload ?? {},
      read: plain.read,
      createdAt: new Date(plain.createdAt).getTime(),
    };
  }

  async deleteNotification(id: number, userId: number): Promise<boolean> {
    const deleted = await this.notificationRepository.destroy({
      where: { id, userId },
    });
    return deleted > 0;
  }

  async deleteNotificationsByType(userId: number, type: string): Promise<void> {
    await this.notificationRepository.destroy({
      where: { userId, type },
    });
  }

  async markNotificationRead(id: number, userId: number): Promise<boolean> {
    const [updated] = await this.notificationRepository.update(
      { read: true },
      { where: { id, userId, read: false } },
    );
    return updated > 0;
  }

  async markAllNotificationsRead(userId: number): Promise<void> {
    await this.notificationRepository.update(
      { read: true },
      { where: { userId, read: false } },
    );
  }

  async markNotificationsReadByType(
    userId: number,
    type: string,
  ): Promise<void> {
    await this.notificationRepository.update(
      { read: true },
      { where: { userId, type, read: false } },
    );
  }

  async getReferralStats(
    userId: number,
  ): Promise<{ code: string | null; referredCount: number }> {
    const user = await this.userRepository.findByPk(userId, { raw: true });
    if (!user) return { code: null, referredCount: 0 };

    const referrals = await this.userRepository.count({
      where: { referredBy: userId },
    });

    return {
      code: user.referralCode,
      referredCount: referrals,
    };
  }

  async applyReferralCode(
    newUserId: number,
    referralCode: string,
    onlineUsersService?: any,
  ): Promise<void> {
    const referrer = await this.userRepository.findOne({
      where: { referralCode },
      raw: true,
    });

    if (!referrer) return;

    await this.userRepository.update(
      { referredBy: referrer.id },
      { where: { id: newUserId } },
    );

    const newCoins = referrer.coins + 500;
    await this.updateUserCoins(referrer.id, newCoins);

    if (onlineUsersService) {
      try {
        onlineUsersService.updateCoins(referrer.id, newCoins);
      } catch (err) {
        this.logger.warn(`Failed to update online user coins: ${err}`);
      }
    }
  }

  async findUserById(userId: number): Promise<User | null> {
    return this.userRepository.findByPk(userId);
  }

  async listBots(visibleOnly = false): Promise<Bot[]> {
    return this.botRepository.findAll({
      ...(visibleOnly ? { where: { hidden: false } } : {}),
      order: [["id", "ASC"]],
    });
  }

  async createBot(data: BotProfileInput): Promise<Bot> {
    const p = normalizeBotProfileInput(data);
    if (!p.nickname || p.nickname.length < 2 || p.nickname.length > 20) {
      throw new Error("INVALID_NICKNAME");
    }
    if (!p.roomId) throw new Error("INVALID_ROOM");
    const socketId = randomBytes(12).toString("base64url").slice(0, 20);
    return this.botRepository.create({
      nickname: p.nickname,
      roomId: p.roomId,
      characterType: p.characterType,
      gender: p.gender,
      eyeColor: p.eyeColor,
      socketId,
      status: p.status,
      coins: p.coins,
      inventoryValue: p.inventoryValue,
      badges: p.badges,
      ownedItems: p.ownedItems,
      equipped: p.equipped,
      anketa_about: p.anketa_about,
      anketa_city: p.anketa_city,
      anketa_interests: p.anketa_interests,
      anketa_age: p.anketa_age,
      anketa_looking_for: p.anketa_looking_for,
      statusPool: p.statusPool,
      hidden: false,
    } as any);
  }

  async setBotHidden(id: number, hidden: boolean): Promise<Bot | null> {
    const row = await this.botRepository.findByPk(id);
    if (!row) return null;
    await row.update({ hidden });
    await row.reload();
    return row;
  }

  async updateBot(id: number, data: BotProfileInput): Promise<Bot | null> {
    const row = await this.botRepository.findByPk(id);
    if (!row) return null;
    const p = normalizeBotProfileInput({
      nickname: data.nickname ?? row.nickname,
      roomId: data.roomId ?? row.roomId,
      characterType: data.characterType ?? row.characterType,
      gender: data.gender ?? row.gender,
      eyeColor: data.eyeColor ?? row.eyeColor,
      status: data.status ?? row.status,
      coins: data.coins ?? row.coins,
      inventoryValue: data.inventoryValue ?? row.inventoryValue,
      badges: data.badges ?? row.badges,
      ownedItems: data.ownedItems ?? row.ownedItems,
      equipped: data.equipped ?? row.equipped,
      anketa_about: data.anketa_about !== undefined ? data.anketa_about : row.anketa_about,
      anketa_city: data.anketa_city !== undefined ? data.anketa_city : row.anketa_city,
      anketa_interests:
        data.anketa_interests !== undefined ? data.anketa_interests : row.anketa_interests,
      anketa_age: data.anketa_age !== undefined ? data.anketa_age : row.anketa_age,
      anketa_looking_for:
        data.anketa_looking_for !== undefined
          ? data.anketa_looking_for
          : row.anketa_looking_for,
      statusPool: data.statusPool ?? row.statusPool,
    });
    if (!p.nickname || p.nickname.length < 2 || p.nickname.length > 20) {
      throw new Error("INVALID_NICKNAME");
    }
    await row.update({
      nickname: p.nickname,
      roomId: p.roomId,
      characterType: p.characterType,
      gender: p.gender,
      eyeColor: p.eyeColor,
      status: p.status,
      coins: p.coins,
      inventoryValue: p.inventoryValue,
      badges: p.badges,
      ownedItems: p.ownedItems,
      equipped: p.equipped,
      anketa_about: p.anketa_about,
      anketa_city: p.anketa_city,
      anketa_interests: p.anketa_interests,
      anketa_age: p.anketa_age,
      anketa_looking_for: p.anketa_looking_for,
      statusPool: p.statusPool,
    });
    return row;
  }

  async deleteBot(id: number): Promise<boolean> {
    const n = await this.botRepository.destroy({ where: { id } });
    return n > 0;
  }

  async countRegisteredUsers(): Promise<number> {
    return this.userRepository.count({ where: { isGuest: false } });
  }

  async listUsersForAdmin(query: string, limit = 1000) {
    const q = query.trim();
    const base = { isGuest: false };
    const where = q
      ? /^\d+$/.test(q)
        ? {
            ...base,
            [Op.or]: [
              { id: parseInt(q, 10) },
              { nickname: { [Op.iLike]: `%${q}%` } },
            ],
          }
        : { ...base, nickname: { [Op.iLike]: `%${q}%` } }
      : base;
    return this.userRepository.findAll({
      where,
      attributes: [
        "id",
        "nickname",
        "coins",
        "lastSalaryAt",
        "salaryClaimCount",
        "role",
        "banned",
        "badges",
        "characterType",
        "streak_days",
        "starterQuestStep",
      ],
      limit: Math.min(Math.max(limit, 1), 2000),
      order: [["nickname", "ASC"]],
      raw: true,
    });
  }

  async searchUsersForAdmin(query: string, limit = 30) {
    const q = query.trim();
    if (!q) return [];
    const base = { isGuest: false };
    const where = /^\d+$/.test(q)
      ? {
          ...base,
          [Op.or]: [
            { id: parseInt(q, 10) },
            { nickname: { [Op.iLike]: `%${q}%` } },
          ],
        }
      : { ...base, nickname: { [Op.iLike]: `%${q}%` } };
    return this.userRepository.findAll({
      where,
      attributes: [
        "id",
        "nickname",
        "coins",
        "lastSalaryAt",
        "salaryClaimCount",
        "role",
        "banned",
        "badges",
        "characterType",
        "streak_days",
        "starterQuestStep",
      ],
      limit,
      order: [["nickname", "ASC"]],
      raw: true,
    });
  }

  async adminAddCoins(userId: number, amount: number): Promise<number | null> {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const user = await this.userRepository.findByPk(userId);
    if (!user) return null;
    const newCoins = user.coins + Math.floor(amount);
    await this.updateUserCoins(userId, newCoins);
    return newCoins;
  }

  async adminResetSalary(userId: number): Promise<boolean> {
    const user = await this.userRepository.findByPk(userId);
    if (!user) return false;
    await this.updateSalary(userId, 0, 0);
    return true;
  }

  async writeAdminLog(
    adminId: number,
    adminNickname: string,
    action: string,
    targetUserId: number | null,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.adminLogRepository.create({
      adminId,
      adminNickname,
      action,
      targetUserId,
      details,
    } as any);
  }

  async writeUserLog(
    userId: number,
    type: string,
    message: string,
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    await this.userLogRepository.create({
      userId,
      type,
      message,
      meta,
    } as any);
  }

  async getAdminLogs(page = 1, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const offset = (Math.max(page, 1) - 1) * safeLimit;
    const { rows, count } = await this.adminLogRepository.findAndCountAll({
      order: [["createdAt", "DESC"]],
      limit: safeLimit,
      offset,
      raw: true,
    });
    return { items: rows, total: count, page: Math.max(page, 1), limit: safeLimit };
  }

  async getUserLogs(userId: number, page = 1, limit = 30) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const offset = (Math.max(page, 1) - 1) * safeLimit;
    const { rows, count } = await this.userLogRepository.findAndCountAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit: safeLimit,
      offset,
      raw: true,
    });
    return { items: rows, total: count, page: Math.max(page, 1), limit: safeLimit };
  }

  async getAdminUserDetail(userId: number) {
    const row = await this.userRepository.findByPk(userId, { raw: true });
    if (!row || (row as any).isGuest) return null;
    const loaded = await this.loadUserForSocket(userId);
    if (!loaded) return null;
    const r = row as any;
    const badges = await this.getUserBadges(userId);
    const equipped: Record<string, { itemId: string; color: string | null }> = {};
    for (const [cat, itemId] of Object.entries(loaded.equipped)) {
      if (itemId) {
        equipped[cat] = {
          itemId,
          color: loaded.equippedColors[cat] ?? null,
        };
      }
    }
    return {
      id: loaded.id,
      nickname: loaded.nickname,
      email: r.email,
      coins: loaded.coins,
      role: loaded.role,
      banned: !!r.banned,
      characterType: loaded.characterType,
      gender: loaded.gender,
      eyeColor: loaded.eyeColor,
      status: loaded.status ?? "",
      badges,
      ownedItems: loaded.ownedItems,
      equipped,
      lastSalaryAt: Number(loaded.lastSalaryAt ?? 0),
      salaryClaimCount: Number(loaded.salaryClaimCount ?? 0),
      streak_days: Number(r.streak_days ?? 0),
      streak_last_date: r.streak_last_date ?? null,
      starterQuestStep: Number(r.starterQuestStep ?? 0),
      anketa_about: r.anketa_about ?? "",
      anketa_city: r.anketa_city ?? "",
      anketa_interests: r.anketa_interests ?? "",
      anketa_age: r.anketa_age ?? "",
      anketa_looking_for: r.anketa_looking_for ?? "",
      createdAt: r.createdAt,
    };
  }

  async adminSetCoins(userId: number, coins: number): Promise<number | null> {
    if (!Number.isFinite(coins) || coins < 0) return null;
    const user = await this.userRepository.findByPk(userId);
    if (!user) return null;
    const next = Math.floor(coins);
    await this.updateUserCoins(userId, next);
    return next;
  }

  async adminSetRole(userId: number, role: string): Promise<boolean> {
    if (role !== "user" && role !== "admin") return false;
    const user = await this.userRepository.findByPk(userId);
    if (!user) return false;
    await user.update({ role });
    return true;
  }

  async adminGrantItem(userId: number, itemId: string): Promise<string[] | null> {
    if (!getShopItemById(itemId)) return null;
    const user = await this.userRepository.findByPk(userId);
    if (!user) return null;
    const existing = await this.userItemRepository.findOne({
      where: { userId, itemId },
    });
    if (existing) return null;
    await this.addOwnedItem(userId, itemId);
    const items = await this.userItemRepository.findAll({
      where: { userId },
      raw: true,
    });
    return items.map((i: any) => i.itemId as string);
  }

  async adminRemoveItem(userId: number, itemId: string): Promise<string[] | null> {
    const user = await this.userRepository.findByPk(userId);
    if (!user) return null;
    const existing = await this.userItemRepository.findOne({
      where: { userId, itemId },
    });
    if (!existing) return null;
    const item = getShopItemById(itemId);
    if (item) {
      await this.unequipItem(userId, item.category);
    }
    await this.removeOwnedItem(userId, itemId);
    const items = await this.userItemRepository.findAll({
      where: { userId },
      raw: true,
    });
    return items.map((i: any) => i.itemId as string);
  }

  async adminResetStreak(userId: number): Promise<boolean> {
    const user = await this.userRepository.findByPk(userId);
    if (!user) return false;
    await user.update({ streak_days: 0, streak_last_date: null });
    return true;
  }

  async adminResetStarterQuest(userId: number): Promise<boolean> {
    const user = await this.userRepository.findByPk(userId);
    if (!user) return false;
    await user.update({ starterQuestStep: 0 });
    return true;
  }

  calcInventoryValueFromIds(ownedItems: string[]): number {
    let v = 0;
    for (const id of ownedItems) {
      const it = getShopItemById(id);
      if (it) v += it.price;
    }
    return v;
  }

  async listUserFriends(userId: number, limit = 50) {
    const rows = await this.userFriendRepository.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit,
      raw: true,
    });
    if (!rows.length) return [];
    const friendIds = rows.map((r: any) => r.friendId as number);
    const users = await this.userRepository.findAll({
      where: { id: friendIds },
      attributes: ["id", "nickname", "characterType", "gender", "anketa_avatar"],
      raw: true,
    });
    const byId = new Map(users.map((u: any) => [u.id as number, u]));
    return friendIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((u: any) => ({
        id: u.id as number,
        nickname: u.nickname as string,
        characterType: u.characterType as string,
        gender: u.gender as string,
        anketa_avatar: (u.anketa_avatar as string | null) ?? null,
      }));
  }

  async isUserFriend(userId: number, friendId: number): Promise<boolean> {
    const row = await this.userFriendRepository.findOne({
      where: { userId, friendId },
    });
    return !!row;
  }

  async addUserFriend(userId: number, friendId: number): Promise<boolean> {
    const existing = await this.userFriendRepository.findOne({
      where: { userId, friendId },
    });
    if (existing) return false;
    await this.userFriendRepository.create({ userId, friendId } as any);
    const count = await this.userFriendRepository.count({ where: { userId } });
    if (count === 1) {
      await this.grantBadge(userId, "first_friend");
    }
    return true;
  }

  async removeUserFriend(userId: number, friendId: number): Promise<boolean> {
    const deleted = await this.userFriendRepository.destroy({
      where: { userId, friendId },
    });
    return deleted > 0;
  }

  async listUserCreatedRooms(userId: number, limit = 20) {
    const rows = await this.roomRepository.findAll({
      where: {
        creatorId: userId,
        name: { [Op.notIn]: ["General Room", "Guest Room"] },
      },
      order: [["createdAt", "DESC"]],
      limit,
      attributes: ["id", "name", "description", "photoUrl", "passwordHash"],
      raw: true,
    });
    return rows.map((row: any) => ({
      id: row.id as number,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      photoUrl: (row.photoUrl as string | null) ?? null,
      hasPassword: !!(row.passwordHash as string | null),
    }));
  }

  async listProfilePosts(userId: number, limit = 30) {
    const rows = await this.profilePostRepository.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit,
      raw: true,
    });
    if (!rows.length) return [];
    const postIds = rows.map((row: any) => row.id as number);
    const commentRows = await this.profilePostCommentRepository.findAll({
      where: { postId: postIds },
      order: [["createdAt", "ASC"]],
      raw: true,
    });
    const authorIds = [...new Set(commentRows.map((c: any) => c.userId as number))];
    const authors = authorIds.length
      ? await this.userRepository.findAll({
          where: { id: authorIds },
          attributes: ["id", "nickname"],
          raw: true,
        })
      : [];
    const nickById = new Map(
      authors.map((u: any) => [u.id as number, u.nickname as string]),
    );
    const commentsByPost = new Map<number, Array<{
      id: number;
      postId: number;
      userId: number;
      nickname: string;
      text: string;
      createdAt: unknown;
    }>>();
    for (const row of commentRows as any[]) {
      const postId = row.postId as number;
      const list = commentsByPost.get(postId) ?? [];
      list.push({
        id: row.id as number,
        postId,
        userId: row.userId as number,
        nickname: nickById.get(row.userId as number) ?? "?",
        text: row.text as string,
        createdAt: row.createdAt,
      });
      commentsByPost.set(postId, list);
    }
    return rows.map((row: any) => ({
      id: row.id as number,
      text: row.text as string,
      imageUrl: (row.imageUrl as string | null) ?? null,
      createdAt: row.createdAt,
      comments: commentsByPost.get(row.id as number) ?? [],
    }));
  }

  async createProfilePost(userId: number, text: string, imageUrl: string | null = null) {
    const row = await this.profilePostRepository.create({
      userId,
      text,
      imageUrl,
    } as any);
    return {
      id: row.id,
      text: row.text,
      imageUrl: row.imageUrl ?? null,
      createdAt: row.createdAt,
    };
  }

  async deleteProfilePost(userId: number, postId: number): Promise<boolean> {
    const deleted = await this.profilePostRepository.destroy({
      where: { id: postId, userId },
    });
    return deleted > 0;
  }

  async createProfilePostComment(userId: number, postId: number, text: string) {
    const post = await this.profilePostRepository.findByPk(postId, { raw: true });
    if (!post) return null;
    const row = await this.profilePostCommentRepository.create({
      postId,
      userId,
      text,
    } as any);
    const author = await this.userRepository.findByPk(userId, {
      attributes: ["nickname"],
      raw: true,
    });
    return {
      postOwnerId: (post as any).userId as number,
      comment: {
        id: row.id,
        postId: row.postId,
        userId: row.userId,
        nickname: (author as any)?.nickname ?? "?",
        text: row.text,
        createdAt: row.createdAt,
      },
    };
  }

  async deleteProfilePostComment(
    userId: number,
    commentId: number,
  ): Promise<{ ok: boolean; postOwnerId?: number }> {
    const comment = await this.profilePostCommentRepository.findByPk(commentId, {
      raw: true,
    });
    if (!comment) return { ok: false };
    const post = await this.profilePostRepository.findByPk((comment as any).postId, {
      raw: true,
    });
    if (!post) return { ok: false };
    const postOwnerId = (post as any).userId as number;
    const commentUserId = (comment as any).userId as number;
    if (commentUserId !== userId && postOwnerId !== userId) {
      return { ok: false };
    }
    await this.profilePostCommentRepository.destroy({ where: { id: commentId } });
    return { ok: true, postOwnerId };
  }
}
