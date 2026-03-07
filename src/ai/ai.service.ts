import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BotInstance } from "../bots/bots.constants";
import { BotsService } from "../bots/bots.service";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseService } from "../database/database.service";

// Простая заглушка для персонажей, так как полный промпт очень большой
const PERSONALITIES: Record<
  string,
  { age: number; desc: string; interests: string; style: string }
> = {
  bot_1: { age: 16, desc: "Мечтательная", interests: "фото", style: "мягко" },
  bot_2: { age: 17, desc: "Циничная", interests: "музыка", style: "коротко" },
  bot_3: { age: 15, desc: "Энергичная", interests: "мемы", style: "быстро" },
  bot_4: {
    age: 18,
    desc: "Наблюдательная",
    interests: "кино",
    style: "сарказм",
  },
  bot_5: { age: 14, desc: "Тихая", interests: "птицы", style: "паузы" },
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly cooldowns = new Map<string, number>();
  private readonly roomBuffers = new Map<
    number,
    Array<{ nickname: string; text: string; ts: number }>
  >();
  private readonly RESPONSE_COOLDOWN = 8000;
  private readonly BUFFER_SIZE = 15;

  constructor(
    private configService: ConfigService,
    private botsService: BotsService,
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
  ) {}

  async handleChatMessage(
    senderSocketId: string,
    senderNickname: string,
    text: string,
    roomId: number,
  ): Promise<void> {
    const AI_API_KEY = this.configService.get<string>("AI_API_KEY");
    if (!AI_API_KEY) return;

    const user = this.onlineUsersService.get(senderSocketId);
    if (user?.isBot) return;

    this.pushRoomMessage(roomId, senderNickname, text);

    const bots = this.botsService.getBotsInRoom(roomId);
    if (bots.length === 0) return;

    for (const bot of bots) {
      if (!this.canRespond(bot.socketId)) continue;

      const mentioned = this.isBotMentioned(text, bot);
      const randomChance = Math.random() < 0.04;

      if (!mentioned && !randomChance) continue;

      this.markResponded(bot.socketId);

      const personality = PERSONALITIES[bot.socketId] || PERSONALITIES["bot_1"];
      const systemPrompt = this.buildSystemPrompt(bot, personality);
      const context = this.getRoomContext(roomId, bot.nickname);

      const response = await this.callAI(systemPrompt, context);
      if (!response) continue;

      // Здесь должна быть логика отправки ответа через Gateway
      // Для краткости опущена реализация эмита, так как требует доступа к сокету
      this.logger.debug(
        `AI Response from ${bot.nickname}: ${response.substring(0, 50)}...`,
      );
    }
  }

  async handleDm(
    fromUserId: number,
    fromNickname: string,
    toBotId: number,
  ): Promise<void> {
    const AI_API_KEY = this.configService.get<string>("AI_API_KEY");
    if (!AI_API_KEY) return;

    const bot = this.botsService.getAllBots().find((b) => b.id === toBotId);
    if (!bot) return;

    const personality = PERSONALITIES[bot.socketId] || PERSONALITIES["bot_1"];
    const systemPrompt =
      this.buildSystemPrompt(bot, personality) +
      `\n\nЭто личная переписка с ${fromNickname}. Отвечай напрямую.`;

    const history = await this.dbService.getDirectMessages(
      toBotId,
      fromUserId,
      10,
    );
    const context = history.map((m: any) => ({
      nickname: m.fromUserId === toBotId ? bot.nickname : fromNickname,
      text: m.text,
      isMe: m.fromUserId === toBotId,
    }));

    const response = await this.callAI(systemPrompt, context);
    if (!response) return;

    await this.dbService.saveDirectMessage(toBotId, fromUserId, response);
    // Эмит через Gateway
  }

  private canRespond(botSid: string): boolean {
    const last = this.cooldowns.get(botSid) || 0;
    return Date.now() - last > this.RESPONSE_COOLDOWN;
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

  private buildSystemPrompt(bot: BotInstance, personality: any): string {
    return `Ты ${bot.nickname}, ${personality.age} лет. Чат Whispering Paws. ${personality.desc}. Стиль: ${personality.style}.`;
  }

  private async callAI(
    systemPrompt: string,
    context: any[],
  ): Promise<string | null> {
    const AI_API_KEY = this.configService.get<string>("AI_API_KEY");
    const AI_BASE_URL =
      this.configService.get<string>("AI_BASE_URL") ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1";
    const AI_MODEL = this.configService.get<string>("AI_MODEL") || "qwen-plus";

    if (!AI_API_KEY) return null;

    const messages = [
      { role: "system", content: systemPrompt },
      ...context.map((m) => ({
        role: m.isMe ? "assistant" : "user",
        content: m.isMe ? m.text : `${m.nickname}: ${m.text}`,
      })),
    ];

    try {
      const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify({ model: AI_MODEL, messages }),
      });

      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
      this.logger.error("AI API error:", e);
      return null;
    }
  }
}
