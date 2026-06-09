import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Server } from "socket.io";
import { DatabaseService } from "../database/database.service";
import { OnlineUsersService } from "../common/services/online-users.service";
import { Bot } from "../database/models/bot.model";
import { loadBotTimingConfig, type BotTimingConfig } from "./bot-config";
import {
  findSpawnX,
  resolveMoveTarget,
  spawnBandAroundHumans,
  type RoomOccupant,
  type SpawnBand,
} from "./bot-spacing";
import { rand, sleep } from "./bot-utils";
import { botRowToProfileFields } from "./bot-profile.util";
import { BOT_RUNTIME_DEFAULTS, BotInstance } from "./bots.constants";
import {
  JOIN_SYSTEM_MESSAGES,
  LEAVE_SYSTEM_MESSAGES,
  pickSystemMessage,
} from "../common/constants/system-messages";

const BOT_ID_OFFSET = 900000;

function recordToInstance(
  row: Bot,
  x?: number,
  y?: number,
): BotInstance {
  const profile = botRowToProfileFields(row);
  return {
    id: BOT_ID_OFFSET + row.id,
    socketId: row.socketId,
    nickname: row.nickname,
    characterType: row.characterType,
    gender: row.gender,
    eyeColor: row.eyeColor,
    roomId: row.roomId,
    x: x ?? 100 + Math.random() * 900,
    y: y ?? 0,
    ...profile,
    ...BOT_RUNTIME_DEFAULTS,
  };
}

const EMPTY_EQUIPPED: Record<string, string | null> = {
  effects: null,
  hats: null,
  masks: null,
  bottom: null,
  tops: null,
  shoes: null,
  items: null,
  vehicles: null,
  tattoos: null,
  glasses: null,
};

const EMOTIONS = [
  "neutral",
  "happy",
  "love",
  "laugh",
  "cool",
  "cry",
  "angry",
  "sleep",
];

@Injectable()
export class BotsService implements OnModuleDestroy {
  private readonly logger = new Logger(BotsService.name);
  private bots: Map<string, BotInstance> = new Map();
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private io: Server | null = null;
  private generalRoomId: number | null = null;
  private aiDialogueCallback:
    | ((participants: BotInstance[]) => Promise<void>)
    | null = null;
  private aiAmbientCallback: (() => Promise<void>) | null = null;
  private readonly timing: BotTimingConfig;

  constructor(
    private configService: ConfigService,
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
  ) {
    this.timing = loadBotTimingConfig(configService);
  }

  isEnabled(): boolean {
    return this.timing.enabled;
  }

  setIo(io: Server) {
    this.io = io;
  }

  setAiDialogueCallback(cb: (participants: BotInstance[]) => Promise<void>) {
    this.aiDialogueCallback = cb;
  }

  setAiAmbientCallback(cb: () => Promise<void>) {
    this.aiAmbientCallback = cb;
  }

  onModuleDestroy() {
    this.stop();
  }

  async init(generalRoomId: number): Promise<void> {
    this.generalRoomId = generalRoomId;
    await this.spawnBots();
  }

  start(): void {
    if (!this.io) {
      this.logger.warn("IO not set, cannot start bots");
      return;
    }
    if (!this.generalRoomId) {
      this.logger.warn("General room id not set, cannot start bots");
      return;
    }
    if (this.running) return;
    this.running = true;
    if (this.bots.size === 0) void this.spawnBots();
    this.scheduleNextDialogue();
    this.scheduleAmbientChatter();
    for (const bot of this.bots.values()) {
      this.scheduleBotActivities(bot);
    }
    this.logger.log("Bots started");
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.bots.clear();
    this.logger.log("Bots stopped");
  }

  scheduleTask(fn: () => void | Promise<void>, delayMs: number): void {
    const t = setTimeout(() => void fn(), delayMs);
    this.timers.push(t);
  }

  private getSpawnBand(roomId: number): SpawnBand {
    return spawnBandAroundHumans(this.getHumanOccupants(roomId));
  }

  private async spawnBots(): Promise<void> {
    this.bots.clear();
    const records = await this.dbService.listBots(true);
    const placed: RoomOccupant[] = [];
    for (const row of records) {
      const band = this.getSpawnBand(row.roomId);
      const others = [...placed, ...this.getHumanOccupants(row.roomId)];
      const x = findSpawnX(others, band);
      const bot = recordToInstance(row, x, 0);
      this.bots.set(bot.socketId, bot);
      placed.push({ socketId: bot.socketId, x });
    }
  }

  private getHumanOccupants(roomId: number): RoomOccupant[] {
    return this.onlineUsersService
      .getByRoom(roomId)
      .filter((u) => !u.isBot)
      .map((u) => ({ socketId: u.socketId, x: u.x }));
  }

  private getRoomOccupants(
    roomId: number,
    excludeSocketId?: string,
  ): RoomOccupant[] {
    const fromBots = Array.from(this.bots.values())
      .filter((b) => b.roomId === roomId)
      .map((b) => ({ socketId: b.socketId, x: b.x }));
    const fromHumans = this.getHumanOccupants(roomId);
    const all = [...fromHumans, ...fromBots];
    if (!excludeSocketId) return all;
    return all.filter((o) => o.socketId !== excludeSocketId);
  }

  async spawnBotRecord(row: Bot): Promise<BotInstance | null> {
    if (row.hidden) return null;
    const x = findSpawnX(this.getRoomOccupants(row.roomId), this.getSpawnBand(row.roomId));
    const bot = recordToInstance(row, x, 0);
    this.bots.set(bot.socketId, bot);
    if (this.running) {
      this.scheduleBotActivities(bot);
      this.io?.to(`room:${bot.roomId}`).emit("user:join", this.toOnlineUser(bot));
      this.emitBotJoinSystemMessage(bot);
    }
    return bot;
  }

  async refreshBotRecord(row: Bot): Promise<void> {
    const runtimeId = BOT_ID_OFFSET + row.id;
    if (row.hidden) {
      await this.removeBotByRuntimeId(runtimeId);
      return;
    }
    const old = this.getBotById(runtimeId);
    const keepPos =
      old && old.roomId === row.roomId && !Number.isNaN(old.x);
    const x = keepPos
      ? old!.x
      : findSpawnX(
          this.getRoomOccupants(row.roomId),
          this.getSpawnBand(row.roomId),
        );
    const bot = recordToInstance(row, x, keepPos ? old!.y : 0);
    if (old) {
      this.bots.delete(old.socketId);
      if (old.roomId !== bot.roomId) {
        this.emitBotLeaveSystemMessage(old);
        this.io?.to(`room:${old.roomId}`).emit("user:leave", old.socketId);
      }
    }
    this.bots.set(bot.socketId, bot);
    if (this.running && this.io) {
      this.io.to(`room:${bot.roomId}`).emit("user:join", this.toOnlineUser(bot));
      if (!old) {
        this.scheduleBotActivities(bot);
        this.emitBotJoinSystemMessage(bot);
      } else if (old.roomId !== bot.roomId) {
        this.emitBotJoinSystemMessage(bot);
      }
    }
  }

  async removeBotByRuntimeId(runtimeId: number): Promise<void> {
    const bot = this.getBotById(runtimeId);
    if (!bot) return;
    this.bots.delete(bot.socketId);
    if (this.running) {
      this.emitBotLeaveSystemMessage(bot);
    }
    this.io?.to(`room:${bot.roomId}`).emit("user:leave", bot.socketId);
  }

  private scheduleBotActivities(bot: BotInstance): void {
    this.scheduleMove(bot);
    this.scheduleStatusChange(bot);
    this.scheduleEmotionChange(bot);
    this.scheduleAfkBurst(bot);
  }

  getBotById(id: number): BotInstance | undefined {
    return Array.from(this.bots.values()).find((b) => b.id === id);
  }

  private flattenEquipped(bot: BotInstance) {
    const equipped = { ...EMPTY_EQUIPPED };
    const equippedColors = { ...EMPTY_EQUIPPED };
    for (const [cat, val] of Object.entries(bot.equipped)) {
      if (!val || !(cat in equipped)) continue;
      equipped[cat] = val.itemId;
      equippedColors[cat] = val.color;
    }
    return { equipped, equippedColors };
  }

  receiveGift(
    bot: BotInstance,
    itemId: string,
    category: string,
    color: string | null,
    inventoryValue: number,
  ): boolean {
    bot.ownedItems.push(itemId);
    bot.inventoryValue = inventoryValue;

    if (!(category in bot.equipped) || Math.random() > 0.72) {
      return false;
    }

    bot.equipped[category] = { itemId, color };
    this.emitBotEquip(bot);

    if (Math.random() < 0.6) {
      bot.emotion = "love";
      this.io?.to(`room:${bot.roomId}`).emit("user:emotion", {
        socketId: bot.socketId,
        emotion: bot.emotion,
      });
    }

    return true;
  }

  private emitBotJoinSystemMessage(bot: BotInstance): void {
    if (!this.io) return;
    const joinMessage = pickSystemMessage(JOIN_SYSTEM_MESSAGES);
    void this.dbService
      .saveChatMessage({
        roomId: bot.roomId,
        userId: null,
        nickname: bot.nickname,
        text: joinMessage,
        gender: bot.gender,
        isSystem: true,
      })
      .then(() => {
        this.io!.to(`room:${bot.roomId}`).emit("chat:message", {
          msgId: Date.now(),
          socketId: "__system__",
          nickname: bot.nickname,
          text: joinMessage,
          timestamp: Date.now(),
          gender: bot.gender,
        });
      });
  }

  private emitBotLeaveSystemMessage(bot: BotInstance): void {
    if (!this.io) return;
    const leaveMessage = pickSystemMessage(LEAVE_SYSTEM_MESSAGES);
    void this.dbService
      .saveChatMessage({
        roomId: bot.roomId,
        userId: null,
        nickname: bot.nickname,
        text: leaveMessage,
        gender: bot.gender,
        isSystem: true,
      })
      .then(() => {
        this.io!.to(`room:${bot.roomId}`).emit("chat:message", {
          msgId: Date.now(),
          socketId: "__system__",
          nickname: bot.nickname,
          text: leaveMessage,
          timestamp: Date.now(),
          gender: bot.gender,
        });
      });
  }

  private emitBotEquip(bot: BotInstance): void {
    const { equipped, equippedColors } = this.flattenEquipped(bot);
    this.io?.to(`room:${bot.roomId}`).emit("user:equip", {
      socketId: bot.socketId,
      equipped,
      equippedColors,
    });
  }

  toOnlineUser(bot: BotInstance) {
    const { equipped, equippedColors } = this.flattenEquipped(bot);
    return {
      id: bot.id,
      socketId: bot.socketId,
      nickname: bot.nickname,
      x: bot.x,
      y: bot.y,
      coins: bot.coins,
      ownedItems: bot.ownedItems,
      equipped,
      equippedColors,
      characterType: bot.characterType,
      gender: bot.gender,
      eyeColor: bot.eyeColor,
      emotion: bot.emotion,
      status: bot.status,
      role: bot.role,
      invisible: bot.invisible,
      inventoryValue: bot.inventoryValue,
      notificationsOff: bot.notificationsOff,
      animationsOff: bot.animationsOff,
      badges: bot.badges,
      anketa_about: bot.anketa_about,
      anketa_city: bot.anketa_city,
      anketa_interests: bot.anketa_interests,
      anketa_age: bot.anketa_age,
      anketa_looking_for: bot.anketa_looking_for,
      afk: false,
    };
  }

  emitBotTyping(bot: BotInstance): void {
    this.io?.to(`room:${bot.roomId}`).emit("chat:typing", {
      socketId: bot.socketId,
      nickname: bot.nickname,
    });
  }

  async deliverRoomMessage(
    bot: BotInstance,
    text: string,
    dbService: DatabaseService,
  ): Promise<void> {
    if (!this.io || !text) return;
    await sleep(rand(this.timing.replyDelayMinMs, this.timing.replyDelayMaxMs));
    if (Math.random() < 0.75) {
      this.emitBotTyping(bot);
      await sleep(
        rand(
          this.timing.typingMinMs,
          Math.min(this.timing.typingMaxMs, text.length * 45),
        ),
      );
    }
    const saved = await dbService.saveChatMessage({
      roomId: bot.roomId,
      userId: null,
      nickname: bot.nickname,
      text,
      gender: bot.gender,
      isSystem: false,
    });
    this.io.to(`room:${bot.roomId}`).emit("chat:message", {
      msgId: saved.id,
      socketId: bot.socketId,
      userId: bot.id,
      nickname: bot.nickname,
      text,
      timestamp: Date.now(),
      gender: bot.gender,
      badges: bot.badges,
    });
  }

  async deliverDmMessage(
    client: { emit: (event: string, data: unknown) => void },
    bot: BotInstance,
    toUserId: number,
    text: string,
    dbService: DatabaseService,
  ): Promise<void> {
    if (!text) return;
    await sleep(rand(this.timing.dmDelayMinMs, this.timing.dmDelayMaxMs));
    if (Math.random() < 0.8) {
      client.emit("dm:typing", {
        socketId: bot.socketId,
        nickname: bot.nickname,
      });
      await sleep(
        rand(
          this.timing.typingMinMs,
          Math.min(this.timing.typingMaxMs, text.length * 40),
        ),
      );
    }
    const saved = await dbService.saveDirectMessage(bot.id, toUserId, text);
    client.emit("dm:message", {
      id: saved.id,
      fromUserId: bot.id,
      toUserId,
      nickname: bot.nickname,
      text,
      timestamp: parseInt(saved.timestamp, 10),
    });
  }

  private scheduleNextDialogue(): void {
    if (!this.running || !this.io) return;
    const pause = rand(this.timing.dialogueMinMs, this.timing.dialogueMaxMs);
    const t = setTimeout(() => {
      if (!this.running) return;
      if (
        this.aiDialogueCallback &&
        Math.random() < this.timing.dialogueRunChance
      ) {
        const allBots = Array.from(this.bots.values());
        if (allBots.length >= 2) {
          const shuffled = [...allBots].sort(() => Math.random() - 0.5);
          const count = Math.random() < 0.35 ? 3 : 2;
          const participants = shuffled.slice(
            0,
            Math.min(count, shuffled.length),
          );
          void this.aiDialogueCallback(participants);
        }
      }
      this.scheduleNextDialogue();
    }, pause);
    this.timers.push(t);
  }

  private scheduleAmbientChatter(): void {
    if (!this.running || !this.io) return;
    const pause = rand(this.timing.ambientMinMs, this.timing.ambientMaxMs);
    const t = setTimeout(() => {
      if (!this.running) return;
      if (
        this.aiAmbientCallback &&
        Math.random() < this.timing.ambientRunChance
      ) {
        void this.aiAmbientCallback();
      }
      this.scheduleAmbientChatter();
    }, pause);
    this.timers.push(t);
  }

  private scheduleMove(bot: BotInstance): void {
    if (!this.running || !this.io) return;
    const delay = rand(this.timing.moveMinMs, this.timing.moveMaxMs);
    const t = setTimeout(() => {
      if (!this.running) return;
      if (Math.random() < 0.2) {
        this.scheduleMove(bot);
        return;
      }
      const shift = rand(-480, 480);
      const desiredX = bot.x + shift;
      const others = this.getRoomOccupants(bot.roomId, bot.socketId);
      const targetX = resolveMoveTarget(bot.x, desiredX, others, bot.socketId);
      if (targetX !== bot.x) {
        void this.emitBotMoveSmooth(bot, targetX);
      }
      this.scheduleMove(bot);
    }, delay);
    this.timers.push(t);
  }

  private async emitBotMoveSmooth(
    bot: BotInstance,
    targetX: number,
  ): Promise<void> {
    const steps = rand(4, 10);
    const startX = bot.x;
    const others = this.getRoomOccupants(bot.roomId, bot.socketId);
    for (let i = 1; i <= steps; i++) {
      await sleep(rand(60, 180));
      const rawX = Math.round(startX + ((targetX - startX) * i) / steps);
      const x = resolveMoveTarget(bot.x, rawX, others, bot.socketId);
      if (x === bot.x && i < steps) continue;
      this.emitBotMove(bot, x, 0);
    }
  }

  private scheduleStatusChange(bot: BotInstance): void {
    if (!this.running || !this.io) return;
    const delay = rand(180000, 600000);
    const t = setTimeout(() => {
      if (!this.running) return;
      const pool = bot.statusPool;
      bot.status = pool[Math.floor(Math.random() * pool.length)];
      this.io?.to(`room:${bot.roomId}`).emit("user:status", {
        socketId: bot.socketId,
        status: bot.status,
      });
      this.scheduleStatusChange(bot);
    }, delay);
    this.timers.push(t);
  }

  private scheduleEmotionChange(bot: BotInstance): void {
    if (!this.running || !this.io) return;
    const delay = rand(300000, 900000);
    const t = setTimeout(() => {
      if (!this.running) return;
      if (Math.random() < 0.55) {
        bot.emotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
        this.io?.to(`room:${bot.roomId}`).emit("user:emotion", {
          socketId: bot.socketId,
          emotion: bot.emotion,
        });
      }
      this.scheduleEmotionChange(bot);
    }, delay);
    this.timers.push(t);
  }

  private scheduleAfkBurst(bot: BotInstance): void {
    if (!this.running || !this.io) return;
    const delay = rand(600000, 2400000);
    const t = setTimeout(() => {
      if (!this.running) return;
      if (Math.random() < 0.35) {
        this.io?.to(`room:${bot.roomId}`).emit("user:afk", {
          socketId: bot.socketId,
          afk: true,
        });
        const back = setTimeout(
          () => {
            this.io?.to(`room:${bot.roomId}`).emit("user:afk", {
              socketId: bot.socketId,
              afk: false,
            });
          },
          rand(120000, 600000),
        );
        this.timers.push(back);
      }
      this.scheduleAfkBurst(bot);
    }, delay);
    this.timers.push(t);
  }

  private emitBotMove(bot: BotInstance, x: number, y: number): void {
    bot.x = x;
    bot.y = y;
    this.io?.to(`room:${bot.roomId}`).emit("user:move", {
      socketId: bot.socketId,
      x,
      y,
    });
  }

  getBotsInRoom(roomId: number): BotInstance[] {
    return Array.from(this.bots.values()).filter((b) => b.roomId === roomId);
  }

  getBot(socketId: string): BotInstance | undefined {
    return this.bots.get(socketId);
  }

  getAllBots(): BotInstance[] {
    return Array.from(this.bots.values());
  }
}
