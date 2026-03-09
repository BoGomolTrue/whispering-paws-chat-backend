import { UseGuards } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseService } from "../database/database.service";
import { FilesService } from "../files/files.service";
import { UsersService } from "./user.service";

const PROFILE_KEYS = [
  "nickname",
  "eyeColor",
  "status",
  "characterType",
  "gender",
  "notificationsOff",
  "animationsOff",
  "anketa_about",
  "anketa_city",
  "anketa_interests",
  "anketa_looking_for",
  "anketa_age",
  "anketa_avatar",
] as const;

@WebSocketGateway()
@UseGuards(WsJwtGuard)
export class UsersGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private usersService: UsersService,
    private onlineUsersService: OnlineUsersService,
    private dbService: DatabaseService,
    private filesService: FilesService,
  ) {}

  @SubscribeMessage("profile:uploadAvatar")
  async handleProfileUploadAvatar(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { dataUrl?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("profile:avatarError", { message: "Guests cannot upload" });
      return;
    }
    const dataUrl = data?.dataUrl;
    if (!dataUrl || typeof dataUrl !== "string") {
      client.emit("profile:avatarError", { message: "Invalid data" });
      return;
    }
    try {
      const url = await this.filesService.saveAvatar(dataUrl, user.id);
      client.emit("profile:avatarUrl", { url });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message === "TOO_LARGE"
            ? "Image too large"
            : err.message === "INVALID_FORMAT"
              ? "Unsupported image format"
              : "Upload failed"
          : "Upload failed";
      client.emit("profile:avatarError", { message });
    }
  }

  @SubscribeMessage("profile:get")
  async handleProfileGet(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("profile:error", "Guests cannot open profile");
      return;
    }
    const ranks = await this.dbService.getRanks();
    const maxNicknameLength = await this.dbService.getSettingNumber(
      "max_nickname_length",
      20,
    );
    client.emit("profile:data", {
      ...user,
      inventoryValue: user.inventoryValue,
      ranks,
      maxNicknameLength,
    });
  }

  @SubscribeMessage("profile:save")
  async handleProfileSave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: Record<string, unknown>,
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("profile:error", "Guests cannot save profile");
      return;
    }
    const updates: Record<string, unknown> = {};
    for (const key of PROFILE_KEYS) {
      if (data[key] !== undefined) updates[key] = data[key];
    }
    if (Object.keys(updates).length === 0) {
      client.emit("profile:saved", {});
      return;
    }
    try {
      await this.usersService.updateProfile(user.id, updates);
      Object.assign(user, updates);
      client.emit("profile:saved", updates);
      const hasAnketa = PROFILE_KEYS.some(
        (k) => k.startsWith("anketa_") && updates[k] !== undefined,
      );
      if (hasAnketa && user.roomId) {
        client.to(`room:${user.roomId}`).emit("user:anketaUpdated", {
          socketId: client.id,
          anketa: {
            about: user.anketa_about,
            city: user.anketa_city,
            interests: user.anketa_interests,
            looking_for: user.anketa_looking_for,
            age: user.anketa_age,
            avatar: user.anketa_avatar,
          },
        });
        // Отправляем системное сообщение в чат с ссылкой на анкету
        const text = `edited_anketa [anketa:${user.id}]`;
        await this.dbService.saveChatMessage({
          roomId: user.roomId,
          userId: null,
          nickname: user.nickname,
          text,
          gender: user.gender,
          isSystem: true,
        });
        client.to(`room:${user.roomId}`).emit("chat:message", {
          msgId: Date.now(),
          socketId: "__system__",
          userId: user.id,
          nickname: user.nickname,
          text,
          timestamp: Date.now(),
          gender: user.gender,
          isSystem: true,
        });
      }
    } catch (err) {
      client.emit(
        "profile:error",
        err instanceof Error ? err.message : "Save failed",
      );
    }
  }

  @SubscribeMessage("password:change")
  async handlePasswordChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { oldPassword?: string; newPassword?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("profile:error", "Guests cannot change password");
      return;
    }
    const { oldPassword, newPassword } = data || {};
    if (!oldPassword || !newPassword || newPassword.length < 6) {
      client.emit("profile:error", "Invalid password");
      return;
    }
    try {
      await this.usersService.changePassword(user.id, oldPassword, newPassword);
      client.emit("profile:saved", {});
    } catch (err) {
      client.emit(
        "profile:error",
        err instanceof Error ? err.message : "Password change failed",
      );
    }
  }
}
