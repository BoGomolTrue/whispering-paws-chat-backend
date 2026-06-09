import { Logger, UseGuards } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import * as bcrypt from "bcryptjs";
import { Server, Socket } from "socket.io";
import { AiService } from "../ai/ai.service";
import { BotsService } from "../bots/bots.service";
import { MIN_ROOM_CREATE_RATING } from "../common/constants/room.constants";
import {
  EMOTION_SYSTEM_MESSAGES,
  JOIN_SYSTEM_MESSAGES,
  LEAVE_SYSTEM_MESSAGES,
  pickSystemMessage,
} from "../common/constants/system-messages";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { OnlineUsersService } from "../common/services/online-users.service";
import { getSalaryCooldownRemain } from "../common/utils/salary.util";
import { DatabaseService } from "../database/database.service";
import { FilesService } from "../files/files.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PaymentService } from "../payment/payment.service";
import { ShopService } from "../shop/shop.service";

@WebSocketGateway()
@UseGuards(WsJwtGuard)
export class RoomsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomsGateway.name);

  afterInit() {
    this.onlineUsersService.setIo(this.server);
    this.onlineUsersService.startAfkWatcher();
    this.botsService.setIo(this.server);
    this.botsService.setAiDialogueCallback((participants) =>
      this.aiService.runBotDialogue(participants),
    );
    this.botsService.setAiAmbientCallback(() =>
      this.aiService.runAmbientChatter(),
    );
    void this.initBots();
  }

  constructor(
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
    private shopService: ShopService,
    private paymentService: PaymentService,
    private notificationsService: NotificationsService,
    private filesService: FilesService,
    private wsJwtGuard: WsJwtGuard,
    private botsService: BotsService,
    private aiService: AiService,
  ) {}

  private async initBots() {
    const generalRoomId = await this.dbService.getDefaultRoomId();
    await this.botsService.init(generalRoomId);
    if (this.botsService.isEnabled()) {
      this.botsService.start();
      this.logger.log(`Bots enabled in General Room (id=${generalRoomId})`);
    } else {
      this.logger.log("Bots disabled (AI_BOTS != true)");
    }
  }

  private isSystemRoom(room: { name: string }) {
    return room.name === "General Room" || room.name === "Guest Room";
  }

  private mapRoomDto(room: {
    id: number;
    name: string;
    creatorId: number | null;
    maxUsers: number;
    backgroundType?: string;
    weather?: string;
    photoUrl?: string | null;
    description?: string | null;
    passwordHash?: string | null;
  }) {
    return {
      id: room.id,
      name: room.name,
      creatorId: room.creatorId,
      maxUsers: room.maxUsers,
      online: this.onlineUsersService.countRoomOnline(room.id),
      backgroundType: room.backgroundType ?? "grass",
      weather: room.weather ?? "clear",
      photoUrl: room.photoUrl ?? null,
      description: room.description ?? null,
      hasPassword: !!room.passwordHash,
    };
  }

  private canBypassRoomPassword(
    room: { creatorId: number | null; passwordHash?: string | null },
    user: { id: number; role?: string },
  ): boolean {
    if (!room.passwordHash) return true;
    if (user.role === "admin") return true;
    if (room.creatorId === user.id) return true;
    return false;
  }

  private async verifyRoomPassword(
    room: { passwordHash?: string | null },
    password?: string,
  ): Promise<boolean> {
    if (!room.passwordHash) return true;
    if (!password) return false;
    return bcrypt.compare(password, room.passwordHash);
  }

  private async canJoinRoom(
    room: {
      name: string;
      creatorId: number | null;
      passwordHash?: string | null;
    },
    user: { id: number; role?: string },
    password?: string,
  ): Promise<boolean> {
    if (this.isSystemRoom(room)) return true;
    if (this.canBypassRoomPassword(room, user)) return true;
    return this.verifyRoomPassword(room, password);
  }

  private async emitRoomOnlineUpdate(roomId: number) {
    const room = await this.dbService.getRoomById(roomId);
    if (room) {
      this.server.emit("room:updated", this.mapRoomDto(room));
    }
  }

  private async resolvePhotoDataUrl(
    dataUrl: string | undefined,
    roomId: number,
  ): Promise<string | null> {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    return this.filesService.saveRoomPhoto(dataUrl, roomId);
  }

  private buildEquippedDefaults(): Record<string, string | null> {
    return {
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
  }

  async handleConnection(client: Socket) {
    try {
      let raw = client.data.user;
      if (!raw) {
        try {
          await this.wsJwtGuard.authenticateConnection(client);
          raw = client.data.user;
        } catch (e) {
          this.logger.warn(`handleConnection: auth failed for ${client.id}`, e);
          client.emit("connect_error", new Error("AUTH_REQUIRED"));
          client.disconnect(true);
          return;
        }
      }
      if (!raw) return;

      const isGuest = !!raw.guest;
      this.logger.log(`handleConnection: ${client.id} guest=${isGuest}`);
      const baseRoomId = isGuest
        ? await this.dbService.getGuestRoomId()
        : await this.dbService.getDefaultRoomId();
      let startRoomId = baseRoomId;

      if (!isGuest && raw.lastRoomId) {
        const savedRoom = await this.dbService.getRoomById(raw.lastRoomId);
        if (
          savedRoom &&
          savedRoom.name !== "Guest Room" &&
          this.canBypassRoomPassword(savedRoom, {
            id: raw.id ?? raw.userId,
            role: raw.role,
          })
        ) {
          startRoomId = savedRoom.id;
        }
      }

      const equipped = this.buildEquippedDefaults();
      const equippedColors = this.buildEquippedDefaults();
      if (raw.equipped) {
        for (const [k, v] of Object.entries(raw.equipped)) {
          if (v && equipped[k] !== undefined) {
            equipped[k] = v as string;
            equippedColors[k] =
              (raw.equippedColors as Record<string, string | null>)?.[k] ??
              null;
          }
        }
      }

      const onlineUser = {
        id: raw.id ?? raw.userId ?? raw.guestId,
        socketId: client.id,
        nickname: raw.nickname,
        roomId: startRoomId,
        x: 200 + Math.random() * 600,
        y: 0,
        emotion: "neutral",
        coins: raw.coins ?? 0,
        ownedItems: raw.ownedItems ?? [],
        equipped: raw.equipped ?? equipped,
        equippedColors: raw.equippedColors ?? equippedColors,
        characterType: raw.characterType ?? "cat",
        gender: raw.gender ?? "male",
        eyeColor: raw.eyeColor ?? "#ff0000",
        status: raw.status ?? null,
        role: raw.role ?? "user",
        lastSalaryAt: raw.lastSalaryAt ?? 0,
        salaryClaimCount: raw.salaryClaimCount ?? 0,
        inventoryValue: this.shopService.calcInventoryValue(
          raw.ownedItems ?? [],
        ),
        notificationsOff: raw.notificationsOff,
        animationsOff: raw.animationsOff,
        invisible: !!raw.invisible,
        isGuest: isGuest || undefined,
        anketa_about: raw.anketa_about,
        anketa_city: raw.anketa_city,
        anketa_interests: raw.anketa_interests,
        anketa_looking_for: raw.anketa_looking_for,
        anketa_age: raw.anketa_age,
        anketa_avatar: raw.anketa_avatar,
        badges: Array.isArray(raw.badges) ? raw.badges : [],
        starterQuestStep: raw.starterQuestStep ?? 0,
        lastActiveAt: Date.now(),
        afk: false,
      };

      await this.onlineUsersService.add(client.id, onlineUser as any);
      this.logger.log(
        `Client connected: ${client.id} (${onlineUser.nickname}), joining room ${startRoomId}`,
      );
      await this.joinRoom(client, onlineUser as any, startRoomId);
      this.logger.log(`room:joined emitted to ${client.id}`);
    } catch (err) {
      this.logger.error(`handleConnection error for ${client.id}`, err);
      client.emit(
        "room:error",
        err instanceof Error ? err.message : "Connection failed",
      );
    }
  }

  handleDisconnect(client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (user) {
      this.notificationsService.clearSchedule(user.id);
    }
    if (user && user.roomId) {
      if (!this.onlineUsersService.isAdminHidden(user, user.roomId)) {
        const leaveMessage = pickSystemMessage(LEAVE_SYSTEM_MESSAGES);
        void this.dbService
          .saveChatMessage({
            roomId: user.roomId,
            userId: null,
            nickname: user.nickname,
            text: leaveMessage,
            gender: user.gender,
            isSystem: true,
          })
          .then(() => {
            this.server.to(`room:${user.roomId}`).emit("chat:message", {
              msgId: Date.now(),
              socketId: "__system__",
              nickname: user.nickname,
              text: leaveMessage,
              timestamp: Date.now(),
              gender: user.gender,
            });
          });
      }

      if (!this.onlineUsersService.isAdminHidden(user, user.roomId)) {
        client.to(`room:${user.roomId}`).emit("user:leave", client.id);
      }
      if (!user.isGuest) {
        void this.dbService.updateLastRoomId(user.id, user.roomId);
      }
    }
    const leftRoomId = user?.roomId;
    this.onlineUsersService.remove(client.id);
    if (leftRoomId) {
      void this.emitRoomOnlineUpdate(leftRoomId);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("room:list")
  async handleRoomList(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    const rooms = await this.dbService.getRooms();
    const roomList = rooms
      .filter(
        (r) =>
          r.name !== "Guest Room" || user?.role === "admin" || !!user?.isGuest,
      )
      .map((r) => this.mapRoomDto(r));
    client.emit("room:list", roomList);
  }

  @SubscribeMessage("room:create")
  async handleRoomCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { name?: string; description?: string; photoDataUrl?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("room:error", "Sign up to create rooms");
      return;
    }

    const rating = user.coins + (user.inventoryValue ?? 0);
    if (user.role !== "admin" && rating < MIN_ROOM_CREATE_RATING) {
      client.emit("room:error", "Rating 1000 required to create rooms");
      return;
    }

    const name = data?.name?.trim();
    if (!name || name.length < 1 || name.length > 50) {
      client.emit("room:error", "Invalid room name");
      return;
    }

    const description = data?.description?.trim().slice(0, 500) || null;

    try {
      const room = await this.dbService.createRoom(
        name,
        user.id,
        null,
        description,
      );
      if (data?.photoDataUrl) {
        try {
          const photoUrl = await this.resolvePhotoDataUrl(
            data.photoDataUrl,
            room.id,
          );
          if (photoUrl) {
            await this.dbService.updateRoom(room.id, { photoUrl });
            room.photoUrl = photoUrl;
          }
        } catch {
          void client.emit("room:error", "Invalid room photo");
        }
      }
      void this.joinRoom(client, user, room.id);
      void this.server.emit("room:created", this.mapRoomDto(room));
    } catch {
      void client.emit("room:error", "Room name already taken");
    }
  }

  @SubscribeMessage("room:update")
  async handleRoomUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId?: number;
      name?: string;
      description?: string;
      photoDataUrl?: string;
      removePhoto?: boolean;
      password?: string;
    },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || !data?.roomId) return;

    const room = await this.dbService.getRoomById(data.roomId);
    if (!room || room.creatorId !== user.id || this.isSystemRoom(room)) {
      client.emit("room:error", "Not allowed");
      return;
    }

    const updates: {
      name?: string;
      photoUrl?: string | null;
      description?: string | null;
      passwordHash?: string | null;
    } = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name || name.length > 50) {
        client.emit("room:error", "Invalid room name");
        return;
      }
      updates.name = name;
    }

    if (data.description !== undefined) {
      const description = data.description.trim().slice(0, 500);
      updates.description = description || null;
    }

    if (data.removePhoto) {
      updates.photoUrl = null;
    } else if (data.photoDataUrl) {
      try {
        updates.photoUrl = await this.resolvePhotoDataUrl(
          data.photoDataUrl,
          room.id,
        );
      } catch {
        client.emit("room:error", "Invalid room photo");
        return;
      }
    }

    if (data.password !== undefined) {
      const next = data.password.trim();
      if (!next) {
        updates.passwordHash = null;
      } else if (next.length < 4 || next.length > 50) {
        client.emit("room:error", "Room password must be 4-50 characters");
        return;
      } else {
        updates.passwordHash = await bcrypt.hash(next, 10);
      }
    }

    if (Object.keys(updates).length === 0) return;

    try {
      const updated = await this.dbService.updateRoom(room.id, updates);
      if (!updated) return;
      this.server.emit("room:updated", this.mapRoomDto(updated));
    } catch {
      client.emit("room:error", "Room name already taken");
    }
  }

  @SubscribeMessage("room:join")
  async handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId?: number; password?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !data.roomId) return;

    const room = await this.dbService.getRoomById(data.roomId);
    if (!room) {
      client.emit("room:error", "Room not found");
      return;
    }

    if (user.isGuest && room.name !== "Guest Room") {
      client.emit("room:error", "Guests can only stay in Guest Room");
      return;
    }

    if (!user.isGuest && room.name === "Guest Room" && user.role !== "admin") {
      client.emit("room:error", "Not allowed");
      return;
    }

    if (!(await this.canJoinRoom(room, user, data.password?.trim()))) {
      client.emit("room:error", "Wrong room password");
      return;
    }

    const currentUsers = this.onlineUsersService.getByRoom(room.id);
    if (room.maxUsers !== -1 && currentUsers.length >= room.maxUsers) {
      client.emit("room:error", "Room is full");
      return;
    }

    void this.joinRoom(client, user, room.id);
  }

  @SubscribeMessage("room:leave")
  async handleRoomLeave(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user) return;
    const baseRoomId = user.isGuest
      ? await this.dbService.getGuestRoomId()
      : await this.dbService.getDefaultRoomId();
    void this.joinRoom(client, user, baseRoomId);
  }

  @SubscribeMessage("room:delete")
  async handleRoomDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || !data.roomId) return;
    const room = await this.dbService.getRoomById(data.roomId);
    if (!room || room.creatorId !== user.id) return;
    await this.dbService.deleteRoom(data.roomId);
    this.server.emit("room:deleted", { roomId: data.roomId });
    if (user.roomId === data.roomId) {
      const defaultRoomId = await this.dbService.getDefaultRoomId();
      void this.joinRoom(client, user, defaultRoomId);
    }
  }

  @SubscribeMessage("user:active")
  handleUserActive(@ConnectedSocket() client: Socket) {
    this.onlineUsersService.touchActivity(client.id);
  }

  @SubscribeMessage("user:away")
  handleUserAway(@ConnectedSocket() client: Socket) {
    this.onlineUsersService.markAway(client.id);
  }

  @SubscribeMessage("move")
  handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { x?: number; y?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId || data?.x == null || data?.y == null) return;
    user.x = data.x;
    user.y = data.y;
    this.onlineUsersService.touchActivity(client.id);
    if (!this.onlineUsersService.isAdminHidden(user, user.roomId)) {
      client.to(`room:${user.roomId}`).emit("user:move", {
        socketId: client.id,
        x: data.x,
        y: data.y,
      });
    }
  }

  @SubscribeMessage("emotion")
  async handleEmotion(
    @ConnectedSocket() client: Socket,
    @MessageBody() emotion: string,
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId || typeof emotion !== "string") return;
    user.emotion = emotion;
    this.onlineUsersService.touchActivity(client.id);
    if (!this.onlineUsersService.isAdminHidden(user, user.roomId)) {
      client.to(`room:${user.roomId}`).emit("user:emotion", {
        socketId: client.id,
        emotion,
      });
    }

    const emotionText = EMOTION_SYSTEM_MESSAGES[emotion];
    if (!emotionText) return;
    await this.dbService.saveChatMessage({
      roomId: user.roomId,
      userId: null,
      nickname: user.nickname,
      text: emotionText,
      gender: user.gender,
      isSystem: true,
    });
    this.server.to(`room:${user.roomId}`).emit("chat:message", {
      socketId: "__system__",
      nickname: user.nickname,
      text: emotionText,
      timestamp: Date.now(),
      isSystem: true,
    });
  }

  @SubscribeMessage("nickname:change")
  async handleNicknameChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { name?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) return;
    const name = (data?.name ?? "").trim().substring(0, 20);
    if (!name) return;
    const maxLen = await this.dbService.getSettingNumber(
      "max_nickname_length",
      20,
    );
    if (name.length > maxLen) return;
    const existing = await this.dbService.findUserByNickname(name);
    if (existing && existing.id !== user.id) {
      client.emit("room:error", "Nickname taken");
      return;
    }
    await this.dbService.updateNickname(user.id, name);
    user.nickname = name;
    if (!this.onlineUsersService.isAdminHidden(user, user.roomId)) {
      client.to(`room:${user.roomId}`).emit("user:nickname", {
        socketId: client.id,
        nickname: name,
      });
    }
  }

  private getSalaryCooldownRemain(user: any): number {
    return getSalaryCooldownRemain(
      user.lastSalaryAt ?? 0,
      user.salaryClaimCount ?? 0,
    );
  }

  @SubscribeMessage("salary:claim")
  async handleSalaryClaim(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) return;
    const remain = this.getSalaryCooldownRemain(user);
    if (remain > 0) {
      client.emit("salary:wait", { remainMs: remain });
      return;
    }
    const baseAmount = await this.dbService.getSettingNumber(
      "salary_amount",
      10,
    );
    const { salaryBonusPercent } = await this.dbService.getReferralStats(
      user.id,
    );
    const amount = Math.floor(baseAmount * (1 + salaryBonusPercent / 100));
    const newCoins = user.coins + amount;
    await this.dbService.updateUserCoins(user.id, newCoins);
    const newCount = (user.salaryClaimCount || 0) + 1;
    await this.dbService.updateSalary(user.id, Date.now(), newCount);
    user.coins = newCoins;
    user.lastSalaryAt = Date.now();
    user.salaryClaimCount = newCount;
    const nextCd = 5 * 60 * 1000 + newCount * 30 * 1000;
    client.emit("salary:claimed", { coins: newCoins, nextCooldownMs: nextCd });
    void this.notificationsService.onSalaryClaimed(client, {
      id: user.id,
      lastSalaryAt: user.lastSalaryAt,
      salaryClaimCount: user.salaryClaimCount,
    });
  }

  @SubscribeMessage("user:ban")
  async handleBan(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.role !== "admin" || !data?.userId) return;
    await this.dbService.banUser(data.userId);
    const targetUser = await this.dbService.getUserById(data.userId);
    void this.dbService.writeAdminLog(
      user.id,
      user.nickname,
      "ban",
      data.userId,
      { source: "room_context", nickname: targetUser?.nickname },
    );
    void this.dbService.writeUserLog(
      data.userId,
      "admin_ban",
      `Забанен админом ${user.nickname}`,
      { adminId: user.id, source: "room" },
    );
    const target = this.onlineUsersService.getById(data.userId);
    if (target && this.server) {
      const sock = this.server.sockets.sockets.get(target.socketId);
      if (sock) {
        sock.emit("force:banned", null);
        sock.disconnect(true);
      }
    }
  }

  @SubscribeMessage("user:toggleInvisible")
  async handleToggleInvisible(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) return;
    const next = !user.invisible;
    await this.dbService.setInvisible(user.id, next);
    user.invisible = next;
    client.emit("user:invisibleChanged", { invisible: next });
    if (user.roomId) {
      if (next) {
        const leaveMessage = pickSystemMessage(LEAVE_SYSTEM_MESSAGES);
        void this.dbService
          .saveChatMessage({
            roomId: user.roomId,
            userId: null,
            nickname: user.nickname,
            text: leaveMessage,
            gender: user.gender,
            isSystem: true,
          })
          .then(() => {
            this.server.to(`room:${user.roomId}`).emit("chat:message", {
              msgId: Date.now(),
              socketId: "__system__",
              nickname: user.nickname,
              text: leaveMessage,
              timestamp: Date.now(),
              gender: user.gender,
            });
          });
      } else {
        const joinMessage = pickSystemMessage(JOIN_SYSTEM_MESSAGES);

        void this.dbService
          .saveChatMessage({
            roomId: user.roomId,
            userId: null,
            nickname: user.nickname,
            text: joinMessage,
            gender: user.gender,
            isSystem: true,
          })
          .then(() => {
            this.server.to(`room:${user.roomId}`).emit("chat:message", {
              msgId: Date.now(),
              socketId: "__system__",
              nickname: user.nickname,
              text: joinMessage,
              timestamp: Date.now(),
              gender: user.gender,
            });
          });
      }
      client.to(`room:${user.roomId}`).emit("user:leave", client.id);
      if (!this.onlineUsersService.isAdminHidden(user, user.roomId)) {
        client.to(`room:${user.roomId}`).emit("user:join", user);
      }
      void this.emitRoomOnlineUpdate(user.roomId);
    }
  }

  @SubscribeMessage("room:setBackground")
  async handleSetBackground(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { type?: string; weather?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId) return;

    const room = await this.dbService.getRoomById(user.roomId);
    if (!room) return;

    const isAdmin = user.role === "admin";
    const isCreator = room.creatorId === user.id;
    if (!isAdmin && !isCreator) return;

    const oldBackgroundType = room.backgroundType ?? "grass";
    const oldWeather = room.weather ?? "clear";
    const backgroundType = data.type ?? oldBackgroundType;
    const weather = data.weather ?? oldWeather;

    await this.dbService.updateRoomBackground(
      user.roomId,
      backgroundType,
      weather,
    );

    const changes: string[] = [];
    if (backgroundType !== oldBackgroundType) {
      changes.push("background");
    }
    if (weather !== oldWeather) {
      changes.push("weather");
    }

    if (changes.length > 0) {
      let message: string;
      if (changes.length === 2) {
        message = `changed background to ${backgroundType} and weather to ${weather}`;
      } else if (changes[0] === "background") {
        message = `changed background to ${backgroundType}`;
      } else {
        message = `changed weather to ${weather}`;
      }
      await this.dbService.saveChatMessage({
        roomId: user.roomId,
        userId: null,
        nickname: user.nickname,
        text: message,
        gender: user.gender,
        isSystem: true,
      });
      this.server.to(`room:${user.roomId}`).emit("chat:message", {
        socketId: "__system__",
        nickname: user.nickname,
        text: message,
        timestamp: Date.now(),
        isSystem: true,
      });
    }

    this.server.in(`room:${user.roomId}`).emit("room:backgroundChanged", {
      backgroundType,
      weather,
    });
  }

  private async joinRoom(client: Socket, user: any, roomId: number) {
    const targetRoom = await this.dbService.getRoomById(roomId);
    if (!targetRoom) return;
    if (user.isGuest && targetRoom.name !== "Guest Room") {
      roomId = await this.dbService.getGuestRoomId();
    } else if (
      !user.isGuest &&
      targetRoom.name === "Guest Room" &&
      user.role !== "admin"
    ) {
      return;
    }

    const allOnlineUsers = this.onlineUsersService.getAll();
    for (const onlineUser of allOnlineUsers) {
      if (
        onlineUser.id === user.id &&
        onlineUser.socketId !== client.id &&
        !onlineUser.isBot
      ) {
        const oldSocket = this.server.sockets.sockets.get(onlineUser.socketId);
        if (oldSocket) {
          oldSocket.emit("force:disconnect", "duplicate");
          oldSocket.disconnect(true);
        }
      }
    }

    const prevRoomId = user.roomId;
    if (prevRoomId) {
      void client.leave(`room:${prevRoomId}`);
      if (!this.onlineUsersService.isAdminHidden(user, prevRoomId)) {
        void client.to(`room:${prevRoomId}`).emit("user:leave", client.id);
      }
    }

    user.roomId = roomId;
    user.x = 200 + Math.random() * 600;
    user.y = 0;
    user.lastActiveAt = Date.now();
    user.afk = false;
    this.onlineUsersService.touchActivity(client.id);

    void client.join(`room:${roomId}`);
    if (!user.isGuest) {
      await this.dbService.updateLastRoomId(user.id, roomId);
    }

    const room = await this.dbService.getRoomById(roomId);
    const roomData = room
      ? this.mapRoomDto(room)
      : {
          id: roomId,
          name: "Room",
          creatorId: null,
          maxUsers: 20,
          online: 0,
          backgroundType: "grass" as const,
          weather: "clear" as const,
          photoUrl: null,
        };

    const usersInRoom = [
      ...this.onlineUsersService
        .getByRoom(roomId)
        .filter(
          (u) =>
            u.socketId === client.id ||
            !this.onlineUsersService.isAdminHidden(u, roomId),
        ),
      ...this.botsService
        .getBotsInRoom(roomId)
        .map((bot) => this.botsService.toOnlineUser(bot)),
    ];
    const sellPercent = await this.dbService.getSettingNumber(
      "sell_percent",
      50,
    );
    const shopItems = this.shopService.getItems();
    const coinPackages = this.paymentService.getCoinPackages();
    const chatHistory = await this.dbService.getRoomMessages(roomId);
    const salaryCooldownMs = user.isGuest
      ? 86400000 * 365
      : this.getSalaryCooldownRemain(user);
    const daily = user.isGuest
      ? null
      : await this.dbService.getDailyState(user.id);

    if (!user.isGuest) {
      const step = await this.dbService.onStarterQuestJoined(user.id);
      user.starterQuestStep = step;
    }

    client.emit("room:joined", {
      room: roomData,
      user,
      users: usersInRoom,
      shopItems,
      sellPercent,
      salaryCooldownMs,
      chatHistory,
      coinPackages,
      daily,
    });

    if (!user.isGuest) {
      void this.notificationsService.syncUserNotifications(client, {
        id: user.id,
        lastSalaryAt: user.lastSalaryAt ?? 0,
        salaryClaimCount: user.salaryClaimCount ?? 0,
      });
    }

    if (!this.onlineUsersService.isAdminHidden(user, roomId)) {
      const joinMessage = pickSystemMessage(JOIN_SYSTEM_MESSAGES);
      await this.dbService.saveChatMessage({
        roomId,
        userId: null,
        nickname: user.nickname,
        text: joinMessage,
        gender: user.gender,
        isSystem: true,
      });

      this.server.to(`room:${roomId}`).emit("chat:message", {
        msgId: Date.now(),
        socketId: "__system__",
        nickname: user.nickname,
        text: joinMessage,
        timestamp: Date.now(),
        gender: user.gender,
      });
    }

    if (!this.onlineUsersService.isAdminHidden(user, roomId)) {
      client.to(`room:${roomId}`).emit("user:join", user);
    }
    void this.emitRoomOnlineUpdate(roomId);
    if (prevRoomId && prevRoomId !== roomId) {
      void this.emitRoomOnlineUpdate(prevRoomId);
    }
    void this.handleRoomList(client);
  }
}
