import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op } from "sequelize";
import {
  DAILY_QUESTS,
  getQuestProgress,
  isQuestRewardClaimed,
} from "../daily/daily-quests.config";
import { ChatMessage } from "./models/chat-message.model";
import { DirectMessage } from "./models/direct-message.model";
import { Rank } from "./models/rank.model";
import { Room } from "./models/room.model";
import { Setting } from "./models/settings.model";
import { UserDaily } from "./models/user-daily.model";
import { UserEquipped } from "./models/user-equipped.model";
import { UserItem } from "./models/user-item.model";
import { User } from "./models/user.model";

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
  ) {}

  async onModuleInit() {
    await this.seedSettings();
    await this.seedRanks();
    await this.ensureDefaultRoom();
    await this.ensureGuestRoom();
  }

  // === USER ===
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
      shoes: null,
      clothing: null,
      transport: null,
      items: null,
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
    };
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
    return this.userRepository.create({
      email: data.email,
      password: data.password,
      nickname: data.nickname,
      characterType: data.characterType || "cat",
      gender: data.gender || "male",
      coins: startingCoins,
      vkId: data.vkId ?? null,
      telegramId: data.telegramId ?? null,
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

  // === ITEMS ===
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

  // === ROOMS ===
  async createRoom(name: string, creatorId: number): Promise<Room> {
    return this.roomRepository.create({ name, creatorId } as any);
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

  // === CHAT ===
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

  // === SETTINGS ===
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

  // === RANKS ===
  async seedRanks(): Promise<void> {
    const ranks = [
      { min: 0, name: "Newbie" },
      { min: 100, name: "Curious" },
      { min: 250, name: "Beginner" },
      { min: 500, name: "Adapted" },
      { min: 750, name: "Familiar" },
      { min: 1500, name: "Confident Resident" },
      { min: 3000, name: "Experienced Resident" },
      { min: 5000, name: "Prosperous" },
      { min: 7000, name: "Wealthy" },
      { min: 10000, name: "Rich" },
      { min: 15000, name: "Tycoon" },
      { min: 25000, name: "Millionaire" },
      { min: 35000, name: "Oligarch" },
      { min: 50000, name: "Billionaire" },
      { min: 75000, name: "Grand" },
      { min: 100000, name: "Mythical" },
      { min: 175000, name: "Legend" },
      { min: 250000, name: "Emperor" },
      { min: 350000, name: "Overlord" },
      { min: 500000, name: "Titan" },
      { min: 750000, name: "Demigod" },
      { min: 1000000, name: "God" },
    ];
    for (const r of ranks) {
      await this.rankRepository.findOrCreate({
        where: { min: r.min },
        defaults: r as any,
      });
    }
  }

  async getRanks(): Promise<any[]> {
    return this.rankRepository.findAll({ order: [["min", "ASC"]], raw: true });
  }

  // === DAILY QUESTS ===
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
  ): Promise<{ coins: number; streakDays: number } | null> {
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

    return { coins: (row as any).coins + coins, streakDays };
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
}
