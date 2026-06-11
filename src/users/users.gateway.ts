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
  "tutorialCompleted",
  "anketa_about",
  "anketa_city",
  "anketa_interests",
  "anketa_looking_for",
  "anketa_age",
  "anketa_avatar",
] as const;

const BOT_USER_ID_MIN = 900000;

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

  @SubscribeMessage("profile:view")
  async handleProfileView(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId?: number },
  ) {
    const viewer = this.onlineUsersService.get(client.id);
    if (!viewer) return;

    if (viewer.isGuest) {
      if (!data?.userId) {
        client.emit("profile:error", "Guests cannot open profile");
        return;
      }
      await this.emitProfileView(client, null, data.userId);
      return;
    }

    const targetUserId = data?.userId ?? viewer.id;
    await this.emitProfileView(client, viewer.id, targetUserId);
  }

  @SubscribeMessage("friends:add")
  async handleFriendsAdd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId?: number },
  ) {
    const viewer = this.onlineUsersService.get(client.id);
    if (!viewer || viewer.isGuest || data?.userId == null) return;
    const friendId = data.userId;
    if (friendId === viewer.id) return;
    if (friendId >= BOT_USER_ID_MIN) {
      client.emit("profile:error", "Cannot add bot as friend");
      return;
    }
    const friend = await this.dbService.getUserById(friendId);
    if (!friend || friend.isGuest) {
      client.emit("profile:error", "User not found");
      return;
    }
    await this.dbService.addUserFriend(viewer.id, friendId);
    await this.emitProfileView(client, viewer.id, friendId);
  }

  @SubscribeMessage("friends:remove")
  async handleFriendsRemove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId?: number },
  ) {
    const viewer = this.onlineUsersService.get(client.id);
    if (!viewer || viewer.isGuest || data?.userId == null) return;
    await this.dbService.removeUserFriend(viewer.id, data.userId);
    await this.emitProfileView(client, viewer.id, data.userId);
  }

  @SubscribeMessage("profile:uploadPostImage")
  async handleProfileUploadPostImage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { dataUrl?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("profile:postImageError", { message: "Guests cannot post" });
      return;
    }
    const dataUrl = data?.dataUrl;
    if (!dataUrl || typeof dataUrl !== "string") {
      client.emit("profile:postImageError", { message: "Invalid data" });
      return;
    }
    try {
      const url = await this.filesService.savePostImage(dataUrl, user.id);
      client.emit("profile:postImageUrl", { url });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message === "TOO_LARGE"
            ? "Image too large"
            : err.message === "INVALID_FORMAT"
              ? "Unsupported image format"
              : "Upload failed"
          : "Upload failed";
      client.emit("profile:postImageError", { message });
    }
  }

  @SubscribeMessage("profile:post")
  async handleProfilePost(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { text?: string; imageUrl?: string | null },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("profile:error", "Guests cannot post");
      return;
    }
    const text = (data?.text ?? "").trim().slice(0, 500);
    let imageUrl: string | null = null;
    if (typeof data?.imageUrl === "string" && data.imageUrl.trim()) {
      const url = data.imageUrl.trim();
      if (!url.startsWith("/uploads/post_")) {
        client.emit("profile:error", "Invalid data");
        return;
      }
      imageUrl = url;
    }
    if (!text && !imageUrl) {
      client.emit("profile:error", "Post is empty");
      return;
    }
    await this.dbService.createProfilePost(user.id, text, imageUrl);
    await this.emitProfileView(client, user.id, user.id);
  }

  @SubscribeMessage("profile:postDelete")
  async handleProfilePostDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { postId?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || data?.postId == null) return;
    const ok = await this.dbService.deleteProfilePost(user.id, data.postId);
    if (!ok) {
      client.emit("profile:error", "Post not found");
      return;
    }
    await this.emitProfileView(client, user.id, user.id);
  }

  @SubscribeMessage("profile:postComment")
  async handleProfilePostComment(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { postId?: number; text?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || data?.postId == null) {
      client.emit("profile:error", "Guests cannot comment");
      return;
    }
    const text = (data.text ?? "").trim().slice(0, 300);
    if (!text) {
      client.emit("profile:error", "Comment is empty");
      return;
    }
    const result = await this.dbService.createProfilePostComment(
      user.id,
      data.postId,
      text,
    );
    if (!result) {
      client.emit("profile:error", "Post not found");
      return;
    }
    await this.emitProfileView(client, user.id, result.postOwnerId);
  }

  @SubscribeMessage("profile:postCommentDelete")
  async handleProfilePostCommentDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { commentId?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || data?.commentId == null) return;
    const result = await this.dbService.deleteProfilePostComment(
      user.id,
      data.commentId,
    );
    if (!result.ok || result.postOwnerId == null) {
      client.emit("profile:error", "Comment not found");
      return;
    }
    await this.emitProfileView(client, user.id, result.postOwnerId);
  }

  private async emitProfileView(
    client: Socket,
    viewerId: number | null,
    targetUserId: number,
  ) {
    const target = await this.dbService.getUserById(targetUserId);
    const online = this.onlineUsersService.getById(targetUserId);
    const isGuestTarget = target?.isGuest === true || online?.isGuest === true;
    const ranks = await this.dbService.getRanks();

    if (!target && !online) {
      client.emit("profile:error", "User not found");
      return;
    }

    if (isGuestTarget) {
      client.emit("profile:viewData", {
        userId: targetUserId,
        friends: [],
        posts: [],
        rooms: [],
        isFriend: false,
        isOwn: viewerId === targetUserId,
        ranks,
      });
      return;
    }

    if (!target) {
      client.emit("profile:error", "User not found");
      return;
    }

    const friends = await this.dbService.listUserFriends(targetUserId);
    const posts = await this.dbService.listProfilePosts(targetUserId);
    const rooms = await this.dbService.listUserCreatedRooms(targetUserId);
    const isFriend =
      viewerId != null && viewerId !== targetUserId
        ? await this.dbService.isUserFriend(viewerId, targetUserId)
        : false;
    client.emit("profile:viewData", {
      userId: targetUserId,
      friends,
      posts,
      rooms,
      isFriend,
      isOwn: viewerId === targetUserId,
      ranks,
    });
  }

  @SubscribeMessage("referrals:get")
  async handleReferralsGet(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("referrals:error", "Guests cannot view referrals");
      return;
    }
    try {
      const stats = await this.dbService.getReferralStats(user.id);
      client.emit("referrals:data", stats);
    } catch (err) {
      client.emit(
        "referrals:error",
        err instanceof Error ? err.message : "Failed to load referrals",
      );
    }
  }
}
