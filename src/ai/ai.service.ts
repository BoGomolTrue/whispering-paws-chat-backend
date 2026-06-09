import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { loadBotTimingConfig, type BotTimingConfig } from "../bots/bot-config";
import { humanizeBotText, rand } from "../bots/bot-utils";
import { BotInstance } from "../bots/bots.constants";
import { BotsService } from "../bots/bots.service";
import { initChatIntent } from "../bots/chat-intent";
import { pickRetrievalReply } from "../bots/chat-retrieval";
import { storySessionKey } from "../bots/chat-story-session";
import { alignReplyGender, resolveBotGender } from "../bots/bot-gender";
import {
  DatasetIndex,
  DEFAULT_DATASETS_DIR,
  DEFAULT_INDEX_PATH,
  ensureDatasetIndex,
} from "../bots/dataset-index";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly cooldowns = new Map<string, number>();
  private readonly roomBuffers = new Map<
    number,
    Array<{ nickname: string; text: string; ts: number }>
  >();
  private readonly BUFFER_SIZE = 20;
  private styleSamples: string[] = [];
  private datasetIndex: DatasetIndex | null = null;
  private readonly timing: BotTimingConfig;

  constructor(
    private configService: ConfigService,
    private botsService: BotsService,
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
  ) {
    this.timing = loadBotTimingConfig(configService);
  }

  async onModuleInit() {
    if (!this.timing.enabled) {
      this.logger.log("AI_BOTS disabled, skipping dataset index and NLP init");
      return;
    }

    const datasetsDir =
      this.configService.get<string>("CHAT_STYLE_DIR") || DEFAULT_DATASETS_DIR;
    const indexPath =
      this.configService.get<string>("DATASET_INDEX_PATH") ||
      DEFAULT_INDEX_PATH;

    try {
      const t0 = Date.now();
      const { index, rebuilt } = await ensureDatasetIndex(
        datasetsDir,
        indexPath,
        {
          onProgress: ({ file, scanned, inserted }) => {
            if (scanned % 200_000 === 0) {
              this.logger.log(`  ${file}: ${scanned} lines, ${inserted} pairs`);
            }
          },
        },
      );
      this.datasetIndex = index;
      if (this.datasetIndex) {
        const stats = this.datasetIndex.getStats();
        this.styleSamples = this.datasetIndex.sampleReplies(600);
        this.logger.log(
          `Dataset index ${rebuilt ? "built" : "loaded"}: ${stats.pairs} pairs in ${Math.round((Date.now() - t0) / 1000)}s`,
        );
      } else {
        this.logger.warn(`No dataset index at ${datasetsDir}`);
      }
    } catch (e) {
      this.logger.warn(`Dataset index failed`, e);
    }

    try {
      await initChatIntent(this.datasetIndex);
      this.logger.log("Chat intent NLP ready");
    } catch (e) {
      this.logger.warn("Chat intent NLP failed, using regex fallback", e);
    }
  }

  private async generateReply(
    message: string,
    bot?: BotInstance,
    context: Array<{ nickname: string; text: string; isMe: boolean }> = [],
    sessionKey?: string,
  ): Promise<string> {
    const reply = await pickRetrievalReply(
      message,
      this.styleSamples,
      this.datasetIndex,
      bot,
      context,
      sessionKey,
    );
    if (reply) return reply;
    if (this.datasetIndex) {
      const fallback = humanizeBotText(
        this.datasetIndex.randomReply("small_talk"),
        0.35,
      );
      if (fallback) {
        return bot
          ? alignReplyGender(fallback, resolveBotGender(bot.gender))
          : fallback;
      }
    }
    return "";
  }

  private async produceReply(
    bot: BotInstance,
    message: string,
    context: Array<{ nickname: string; text: string; isMe: boolean }> = [],
    sessionKey?: string,
  ): Promise<string> {
    return this.generateReply(message, bot, context, sessionKey);
  }

  async handleChatMessage(
    senderSocketId: string,
    senderNickname: string,
    text: string,
    roomId: number,
  ): Promise<void> {
    if (!this.timing.enabled || !this.botsService.isEnabled()) return;

    const user = this.onlineUsersService.get(senderSocketId);
    if (user?.isBot) return;

    this.pushRoomMessage(roomId, senderNickname, text);

    const bots = this.botsService.getBotsInRoom(roomId);
    if (bots.length === 0) return;

    const bot = this.pickResponder(bots, text);
    if (!bot) return;

    const mentioned = this.isBotMentioned(text, bot);
    if (mentioned && Math.random() < this.timing.mentionIgnoreChance) return;

    this.markResponded(bot.socketId);

    const context = this.getRoomContext(roomId, bot.nickname);
    const sessionKey = storySessionKey(`room:${roomId}`, senderSocketId);
    const response = await this.produceReply(bot, text, context, sessionKey);
    if (!response) return;

    void this.botsService.deliverRoomMessage(bot, response, this.dbService);
    this.pushRoomMessage(roomId, bot.nickname, response);
  }

  async runBotDialogue(participants: BotInstance[]): Promise<void> {
    if (participants.length < 2) return;

    const roomId = participants[0].roomId;
    const turns = rand(
      this.timing.dialogueTurnsMin,
      Math.max(this.timing.dialogueTurnsMin, this.timing.dialogueTurnsMax),
    );
    let lastText = this.pickChatterSeed(roomId);

    for (let i = 0; i < turns; i++) {
      const bot = participants[i % participants.length];
      if (!this.canRespond(bot.socketId) && i > 0) continue;
      this.markResponded(bot.socketId);

      const ctx = this.getRoomContext(roomId, bot.nickname);
      const text = await this.produceReply(bot, lastText, ctx);
      if (!text) break;

      await this.botsService.deliverRoomMessage(bot, text, this.dbService);
      this.pushRoomMessage(roomId, bot.nickname, text);
      lastText = text;
    }
  }

  async runAmbientChatter(): Promise<void> {
    if (!this.timing.enabled) return;

    const bots = this.botsService.getAllBots();
    if (bots.length === 0) return;

    const roomId = bots[0].roomId;
    const available = bots.filter((b) => this.canRespond(b.socketId));
    const pool = available.length > 0 ? available : bots;
    const bot = pool[rand(0, pool.length - 1)];
    this.markResponded(bot.socketId);

    const seed = this.pickChatterSeed(roomId);
    const text = await this.produceReply(
      bot,
      seed,
      this.getRoomContext(roomId, bot.nickname),
    );
    if (!text) return;

    await this.botsService.deliverRoomMessage(bot, text, this.dbService);
    this.pushRoomMessage(roomId, bot.nickname, text);
  }

  private pickChatterSeed(roomId: number): string {
    const buf = this.roomBuffers.get(roomId);
    if (buf && buf.length > 0 && Math.random() < 0.5) {
      return buf[buf.length - 1].text;
    }
    const fromDataset = this.datasetIndex?.randomUser();
    if (fromDataset) return fromDataset;
    const fallbacks = [
      "скучно тут",
      "тут норм",
      "привет всем",
      "кто тут",
      "что нового",
      "йо",
    ];
    return fallbacks[rand(0, fallbacks.length - 1)];
  }

  async thankForGift(
    bot: BotInstance,
    fromNickname: string,
    itemName: string,
  ): Promise<void> {
    let text: string | null = await this.produceReply(
      bot,
      `${fromNickname} подарил ${itemName}`,
      [],
    );

    if (!text && this.datasetIndex) {
      text = humanizeBotText(this.datasetIndex.randomReply(), 0.35) || null;
    }

    if (!text) return;

    void this.botsService.deliverRoomMessage(bot, text, this.dbService);
    this.pushRoomMessage(bot.roomId, bot.nickname, text);
  }

  async handleDm(
    fromUserId: number,
    fromNickname: string,
    toBotId: number,
  ): Promise<string | null> {
    const bot = this.botsService.getAllBots().find((b) => b.id === toBotId);
    if (!bot) return null;

    if (Math.random() < this.timing.dmIgnoreChance) return null;

    const history = await this.dbService.getDirectMessages(
      toBotId,
      fromUserId,
      16,
    );
    const lastText =
      [...history].reverse().find((m) => m.fromUserId === fromUserId)?.text ??
      "";

    const context = history.map((m: { fromUserId: number; text: string }) => ({
      nickname: m.fromUserId === toBotId ? bot.nickname : fromNickname,
      text: m.text,
      isMe: m.fromUserId === toBotId,
    }));

    const sessionKey = storySessionKey(`dm:${fromUserId}:${toBotId}`, String(fromUserId));
    const response = await this.produceReply(bot, lastText, context, sessionKey);
    return response || null;
  }

  private pickResponder(bots: BotInstance[], text: string): BotInstance | null {
    const mentioned = bots.filter(
      (b) => this.isBotMentioned(text, b) && this.canRespond(b.socketId),
    );
    if (mentioned.length > 0) {
      return mentioned[Math.floor(Math.random() * mentioned.length)];
    }
    const available = bots.filter((b) => this.canRespond(b.socketId));
    if (available.length === 0) return null;
    if (Math.random() > this.timing.replyChance) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  private canRespond(botSid: string): boolean {
    const bot = this.botsService.getBot(botSid);
    const base = this.timing.cooldownMs;
    const last = this.cooldowns.get(botSid) || 0;
    return Date.now() - last > base;
  }

  private markResponded(botSid: string): void {
    this.cooldowns.set(botSid, Date.now());
  }

  private pushRoomMessage(
    roomId: number,
    nickname: string,
    text: string,
  ): void {
    if (!this.roomBuffers.has(roomId)) this.roomBuffers.set(roomId, []);
    const buf = this.roomBuffers.get(roomId)!;
    buf.push({ nickname, text, ts: Date.now() });
    if (buf.length > this.BUFFER_SIZE) buf.shift();
  }

  private getRoomContext(roomId: number, botNickname: string) {
    const buf = this.roomBuffers.get(roomId) || [];
    return buf.map((m) => ({
      nickname: m.nickname,
      text: m.text,
      isMe: m.nickname === botNickname,
    }));
  }

  private isBotMentioned(text: string, bot: BotInstance): boolean {
    const lower = text.toLowerCase();
    const nick = bot.nickname.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");
    return nick.length > 1 && lower.includes(nick);
  }
}
