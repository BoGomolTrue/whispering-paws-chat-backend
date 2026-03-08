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
import { FilesService } from "../files/files.service";

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
    private filesService: FilesService,
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

  @SubscribeMessage("chat:image")
  async handleChatImage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { dataUrl?: string; text?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId) return;
    if (!data?.dataUrl) return;
    if (!this.rateLimitService.checkLimit(client.id, "chat", 10000, 5)) return;
    try {
      const imageUrl = await this.filesService.saveChatImage(data.dataUrl);
      const caption = (data.text ?? "").trim().substring(0, 450);
      const text = `[img:${imageUrl}]${caption}`.substring(0, 500);
      const saved = await this.dbService.saveChatMessage({
        roomId: user.roomId,
        userId: user.isGuest ? null : user.id,
        nickname: user.nickname,
        text,
        gender: user.gender,
        isSystem: false,
      });
      this.server.to(`room:${user.roomId}`).emit("chat:message", {
        msgId: saved.id,
        socketId: client.id,
        userId: user.id,
        nickname: user.nickname,
        text: caption,
        image: imageUrl,
        timestamp: Date.now(),
        gender: user.gender,
      });
      if (!user.isGuest) {
        void this.dbService.incDailyMessages(user.id).catch(() => {});
      }
    } catch (e) {
      client.emit(
        "room:error",
        e instanceof Error ? e.message : "Failed to send image",
      );
    }
  }

  @SubscribeMessage("chat:delete")
  async handleChatDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { msgId?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId || data?.msgId == null) return;
    if (user.role !== "admin") return;
    await this.dbService.deleteChatMessage(data.msgId);
    this.server.to(`room:${user.roomId}`).emit("chat:deleted", { msgId: data.msgId });
  }

  @SubscribeMessage("chat:clear")
  async handleChatClear(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId) return;
    if (user.role !== "admin") return;
    await this.dbService.clearRoomChat(user.roomId);
    this.server.to(`room:${user.roomId}`).emit("chat:cleared");
  }

  @SubscribeMessage("dm:history")
  async handleDmHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { withUserId?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || data?.withUserId == null) return;
    const messages = await this.dbService.getDirectMessages(
      user.id,
      data.withUserId,
    );
    const partner = this.onlineUsersService.getById(data.withUserId);
    const partnerData = partner
      ? {
          id: partner.id,
          nickname: partner.nickname,
          anketa_about: partner.anketa_about,
          anketa_city: partner.anketa_city,
          anketa_avatar: partner.anketa_avatar,
        }
      : null;
    client.emit("dm:history", {
      withUserId: data.withUserId,
      messages: messages.map((m: any) => ({
        id: m.id,
        fromUserId: m.fromUserId,
        toUserId: m.toUserId,
        nickname: this.onlineUsersService.getById(m.fromUserId)?.nickname ?? "",
        text: m.text,
        timestamp: parseInt(m.timestamp, 10),
      })),
      partnerData,
    });
  }

  @SubscribeMessage("dm:read")
  async handleDmRead(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) return;
    await this.dbService.markDmRead(user.id);
  }

  @SubscribeMessage("dm:send")
  async handleDmSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { toUserId?: number; text?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || data?.toUserId == null) return;
    const text = (data.text ?? "").trim().substring(0, 500);
    if (!text) return;
    const saved = await this.dbService.saveDirectMessage(
      user.id,
      data.toUserId,
      text,
    );
    const msg = {
      id: saved.id,
      fromUserId: user.id,
      toUserId: data.toUserId,
      nickname: user.nickname,
      text,
      timestamp: parseInt(saved.timestamp, 10),
    };
    client.emit("dm:message", msg);
    const recipient = this.onlineUsersService.getById(data.toUserId);
    if (recipient) {
      const sock = this.server.sockets.sockets.get(recipient.socketId);
      if (sock) sock.emit("dm:message", msg);
    }
    const fromLast = await this.dbService.getLastDmFrom(data.toUserId);
    if (fromLast === user.id) {
      const recipientSock = recipient
        ? this.server.sockets.sockets.get(recipient.socketId)
        : null;
      if (recipientSock)
        recipientSock.emit("dm:unread", {
          fromUserId: user.id,
          nickname: user.nickname,
          partnerData: { id: user.id, nickname: user.nickname },
        });
    }
  }

  @SubscribeMessage("dm:sendImage")
  async handleDmSendImage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { toUserId?: number; dataUrl?: string; text?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || data?.toUserId == null || !data?.dataUrl)
      return;
    const caption = (data.text ?? "").trim().substring(0, 500);
    try {
      const imageUrl = await this.filesService.saveChatImage(data.dataUrl);
      const text = `[img:${imageUrl}]${caption}`.substring(0, 500);
      const saved = await this.dbService.saveDirectMessage(
        user.id,
        data.toUserId,
        text,
      );
      const msg = {
        id: saved.id,
        fromUserId: user.id,
        toUserId: data.toUserId,
        nickname: user.nickname,
        text: caption,
        image: imageUrl,
        timestamp: parseInt(saved.timestamp, 10),
      };
      client.emit("dm:message", msg);
      const recipient = this.onlineUsersService.getById(data.toUserId);
      if (recipient) {
        const sock = this.server.sockets.sockets.get(recipient.socketId);
        if (sock) sock.emit("dm:message", msg);
      }
      const fromLast = await this.dbService.getLastDmFrom(data.toUserId);
      if (fromLast === user.id && recipient) {
        const recipientSock = this.server.sockets.sockets.get(
          recipient.socketId,
        );
        if (recipientSock)
          recipientSock.emit("dm:unread", {
            fromUserId: user.id,
            nickname: user.nickname,
            partnerData: { id: user.id, nickname: user.nickname },
          });
      }
    } catch (e) {
      client.emit(
        "room:error",
        e instanceof Error ? e.message : "Failed to send image",
      );
    }
  }
}
