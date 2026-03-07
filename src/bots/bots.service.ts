import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Server } from "socket.io";
import { BOT_PROFILES, BotInstance } from "./bots.constants";

@Injectable()
export class BotsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotsService.name);
  private bots: Map<string, BotInstance> = new Map();
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private io: Server | null = null;
  private aiDialogueCallback:
    | ((participants: BotInstance[]) => Promise<void>)
    | null = null;

  // Константы
  private readonly DIALOGUE_PAUSE_MIN = 300000;
  private readonly DIALOGUE_PAUSE_MAX = 900000;
  private readonly MOVE_INTERVAL_MIN = 20000;
  private readonly MOVE_INTERVAL_MAX = 55000;
  private readonly STATUS_CHANGE_MIN = 120000;
  private readonly STATUS_CHANGE_MAX = 360000;
  private readonly STATUS_POOL = [
    "",
    "",
    "",
    "🎮 играю",
    "💤",
    "не беспокоить",
    "🎧 музыка",
    "🔥",
    "скучно",
    "👀",
    "afk",
    "brb",
    "💅 шоппинг",
    "📚 сессия...",
    "😴 спать хочу",
    "✨ vibes",
    "ищу друзей",
    "🐾",
  ];

  setIo(io: Server) {
    this.io = io;
  }

  setAiDialogueCallback(cb: (participants: BotInstance[]) => Promise<void>) {
    this.aiDialogueCallback = cb;
  }

  onModuleInit() {
    if (process.env.AI_BOTS === "true") {
      this.start();
    }
  }

  onModuleDestroy() {
    this.stop();
  }

  start(): void {
    if (!this.io) {
      this.logger.warn("IO not set, cannot start bots");
      return;
    }
    this.running = true;
    this.spawnBots();
    this.scheduleNextDialogue();
    for (const bot of this.bots.values()) {
      this.scheduleMove(bot);
      this.scheduleStatusChange(bot);
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

  private spawnBots(): void {
    for (const profile of BOT_PROFILES) {
      const bot: BotInstance = {
        ...profile,
        x: 100 + Math.random() * 900,
        y: 0,
        roomId: 1, // Default room ID, should be dynamic later
      };
      this.bots.set(bot.socketId, bot);
    }
  }

  private scheduleNextDialogue(): void {
    if (!this.running || !this.io) return;
    const pause = this.rand(this.DIALOGUE_PAUSE_MIN, this.DIALOGUE_PAUSE_MAX);
    const t = setTimeout(() => {
      if (!this.running) return;
      if (this.aiDialogueCallback) {
        const allBots = Array.from(this.bots.values());
        if (allBots.length >= 2) {
          const shuffled = allBots.sort(() => Math.random() - 0.5);
          const count = Math.random() < 0.3 ? 3 : 2;
          const participants = shuffled.slice(
            0,
            Math.min(count, shuffled.length),
          );
          void this.aiDialogueCallback(participants);
        }
      }
      const nextT = setTimeout(
        () => this.scheduleNextDialogue(),
        this.rand(5000, 15000),
      );
      this.timers.push(nextT);
    }, pause);
    this.timers.push(t);
  }

  private scheduleMove(bot: BotInstance): void {
    if (!this.running || !this.io) return;
    const delay = this.rand(this.MOVE_INTERVAL_MIN, this.MOVE_INTERVAL_MAX);
    const t = setTimeout(() => {
      if (!this.running) return;
      const shift = this.rand(-250, 250);
      const newX = Math.max(50, Math.min(1150, bot.x + shift));
      this.emitBotMove(bot, newX, 0);
      this.scheduleMove(bot);
    }, delay);
    this.timers.push(t);
  }

  private scheduleStatusChange(bot: BotInstance): void {
    if (!this.running || !this.io) return;
    const delay = this.rand(this.STATUS_CHANGE_MIN, this.STATUS_CHANGE_MAX);
    const t = setTimeout(() => {
      if (!this.running) return;
      bot.status =
        this.STATUS_POOL[Math.floor(Math.random() * this.STATUS_POOL.length)];
      this.io?.to(`room:${bot.roomId}`).emit("user:status", {
        socketId: bot.socketId,
        status: bot.status,
      });
      this.scheduleStatusChange(bot);
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

  addBot(profile: BotInstance): void {
    this.bots.set(profile.socketId, profile);
    if (this.running) {
      this.scheduleMove(profile);
      this.scheduleStatusChange(profile);
    }
  }

  removeBot(socketId: string): void {
    this.bots.delete(socketId);
  }

  getBot(socketId: string): BotInstance | undefined {
    return this.bots.get(socketId);
  }

  getAllBots(): BotInstance[] {
    return Array.from(this.bots.values());
  }

  private rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
