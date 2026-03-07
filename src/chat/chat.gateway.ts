import { Logger, UseGuards } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AiService } from "../ai/ai.service";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { OnlineUsersService } from "../common/services/online-users.service";
import { RateLimitService } from "../common/services/rate-limit.service";
import { DatabaseService } from "../database/database.service";

@WebSocketGateway()
@UseGuards(WsJwtGuard)
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
    private rateLimitService: RateLimitService,
    private aiService: AiService,
  ) {}

  @SubscribeMessage("chat:message")
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() msg: { text?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId) return;

    if (!msg?.text?.trim()) return;
    if (!this.rateLimitService.checkLimit(client.id, "chat", 10000, 5)) return;

    const text = msg.text.trim().substring(0, 500);

    // Save message
    const saved = await this.dbService.saveChatMessage({
      roomId: user.roomId,
      userId: user.isGuest ? null : user.id,
      nickname: user.nickname,
      text,
      gender: user.gender,
      isSystem: false,
    });

    // Emit to room
    this.server.to(`room:${user.roomId}`).emit("chat:message", {
      msgId: saved.id,
      socketId: client.id,
      userId: user.id,
      nickname: user.nickname,
      text,
      timestamp: Date.now(),
      gender: user.gender,
    });

    if (!user.isGuest) {
      void this.dbService.incDailyMessages(user.id).catch(() => {});
    }

    void this.aiService.handleChatMessage(
      client.id,
      user.nickname,
      text,
      user.roomId,
    );
  }

  @SubscribeMessage("chat:typing")
  handleTyping(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId) return;
    client.to(`room:${user.roomId}`).emit("chat:typing", {
      socketId: client.id,
      nickname: user.nickname,
    });
  }
}
