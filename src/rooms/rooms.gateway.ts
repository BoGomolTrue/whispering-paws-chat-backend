import { Logger, UseGuards } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseService } from "../database/database.service";
import { PaymentService } from "../payment/payment.service";
import { ShopService } from "../shop/shop.service";

@WebSocketGateway()
@UseGuards(WsJwtGuard)
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomsGateway.name);

  constructor(
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
    private shopService: ShopService,
    private paymentService: PaymentService,
    private wsJwtGuard: WsJwtGuard,
  ) {}

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
        if (savedRoom && savedRoom.name !== "Guest Room") {
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
        invisible: raw.invisible,
        isGuest: isGuest || undefined,
        anketa_about: raw.anketa_about,
        anketa_city: raw.anketa_city,
        anketa_interests: raw.anketa_interests,
        anketa_looking_for: raw.anketa_looking_for,
        anketa_age: raw.anketa_age,
        anketa_avatar: raw.anketa_avatar,
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
    if (user && user.roomId) {
      client.to(`room:${user.roomId}`).emit("user:leave", client.id);
      // Сохраняем lastRoomId
      if (!user.isGuest) {
        void this.dbService.updateLastRoomId(user.id, user.roomId);
      }
    }
    this.onlineUsersService.remove(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("room:list")
  async handleRoomList(@ConnectedSocket() client: Socket) {
    const rooms = await this.dbService.getRooms();
    const roomList = rooms.map((r: any) => ({
      id: r.id,
      name: r.name,
      creatorId: r.creatorId,
      maxUsers: r.maxUsers,
      online: this.onlineUsersService.getByRoom(r.id).length,
      backgroundType: r.backgroundType ?? "grass",
      weather: r.weather ?? "clear",
    }));
    client.emit("room:list", roomList);
  }

  @SubscribeMessage("room:create")
  async handleRoomCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { name?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) {
      client.emit("room:error", "Sign up to create rooms");
      return;
    }

    const name = data?.name?.trim();
    if (!name || name.length < 1 || name.length > 50) {
      client.emit("room:error", "Invalid room name");
      return;
    }

    try {
      const room = await this.dbService.createRoom(name, user.id);
      void this.joinRoom(client, user, room.id);
      void this.server.emit("room:created", {
        id: room.id,
        name: room.name,
        creatorId: room.creatorId,
        maxUsers: room.maxUsers,
        online: 1,
      });
    } catch {
      void client.emit("room:error", "Room name already taken");
    }
  }

  @SubscribeMessage("room:join")
  async handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !data.roomId) return;

    const room = await this.dbService.getRoomById(data.roomId);
    if (!room) {
      client.emit("room:error", "Room not found");
      return;
    }

    if (user.isGuest && room.name !== "General Room") {
      client.emit("room:error", "Guests can only stay in General Room");
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

  @SubscribeMessage("move")
  handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { x?: number; y?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId || data?.x == null || data?.y == null) return;
    user.x = data.x;
    user.y = data.y;
    client.to(`room:${user.roomId}`).emit("user:move", {
      socketId: client.id,
      x: data.x,
      y: data.y,
    });
  }

  @SubscribeMessage("emotion")
  async handleEmotion(
    @ConnectedSocket() client: Socket,
    @MessageBody() emotion: string,
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId || typeof emotion !== "string") return;
    user.emotion = emotion;
    client.to(`room:${user.roomId}`).emit("user:emotion", {
      socketId: client.id,
      emotion,
    });

    // Отправляем системное сообщение в чат о смене эмоции
    const emotionNames: Record<string, string> = {
      neutral: "спокоен",
      happy: "радуется",
      love: "влюблён",
      laugh: "смеётся",
      cool: "крут",
      cry: "грустит",
      angry: "злится",
      sleep: "спит",
    };
    const emotionText = emotionNames[emotion] || emotion;
    await this.dbService.saveChatMessage({
      roomId: user.roomId,
      userId: null,
      nickname: "",
      text: `${user.nickname} ${emotionText}`,
      gender: user.gender,
      isSystem: true,
    });
    this.server.to(`room:${user.roomId}`).emit("chat:message", {
      socketId: "__system__",
      nickname: "",
      text: `${user.nickname} ${emotionText}`,
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
    client.to(`room:${user.roomId}`).emit("user:nickname", {
      socketId: client.id,
      nickname: name,
    });
  }

  private getSalaryCooldownRemain(user: any): number {
    const base = 5 * 60 * 1000;
    const extra = 30 * 1000;
    const cd = base + (user.salaryClaimCount || 0) * extra;
    return Math.max(0, cd - (Date.now() - (user.lastSalaryAt || 0)));
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
    const amount = await this.dbService.getSettingNumber("salary_amount", 10);
    const newCoins = user.coins + amount;
    await this.dbService.updateUserCoins(user.id, newCoins);
    const newCount = (user.salaryClaimCount || 0) + 1;
    await this.dbService.updateSalary(user.id, Date.now(), newCount);
    user.coins = newCoins;
    user.lastSalaryAt = Date.now();
    user.salaryClaimCount = newCount;
    const nextCd = 5 * 60 * 1000 + newCount * 30 * 1000;
    client.emit("salary:claimed", { coins: newCoins, nextCooldownMs: nextCd });
  }

  @SubscribeMessage("user:ban")
  async handleBan(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.role !== "admin" || !data?.userId) return;
    await this.dbService.banUser(data.userId);
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
      client.to(`room:${user.roomId}`).emit("user:leave", client.id);
      client.to(`room:${user.roomId}`).emit("user:join", user);
    }
  }

  @SubscribeMessage("room:setBackground")
  async handleSetBackground(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { type?: string; weather?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || !user.roomId) return;

    // Только админ или создатель комнаты может менять фон
    const room = await this.dbService.getRoomById(user.roomId);
    if (!room) return;

    const isAdmin = user.role === "admin";
    const isCreator = room.creatorId === user.id;
    if (!isAdmin && !isCreator) return;

    const oldBackgroundType = room.backgroundType ?? "grass";
    const oldWeather = room.weather ?? "clear";
    const backgroundType = data.type ?? oldBackgroundType;
    const weather = data.weather ?? oldWeather;

    await this.dbService.updateRoomBackground(user.roomId, backgroundType, weather);

    // Отправляем системное сообщение в чат
    const changes: string[] = [];
    if (backgroundType !== oldBackgroundType) {
      const bgNames: Record<string, string> = {
        grass: "Луг",
        field: "Поле",
        mountains: "Горы",
        snow: "Зима",
        beach: "Пляж",
      };
      changes.push(`фон на "${bgNames[backgroundType] || backgroundType}"`);
    }
    if (weather !== oldWeather) {
      const weatherNames: Record<string, string> = {
        clear: "Ясно",
        rain: "Дождь",
        snow: "Снег",
      };
      changes.push(`погоду на "${weatherNames[weather] || weather}"`);
    }

    if (changes.length > 0) {
      const message = `${user.nickname} сменил(а) ${changes.join(" и ")}`;
      await this.dbService.saveChatMessage({
        roomId: user.roomId,
        userId: null,
        nickname: "",
        text: message,
        gender: user.gender,
        isSystem: true,
      });
      this.server.to(`room:${user.roomId}`).emit("chat:message", {
        socketId: "__system__",
        nickname: "",
        text: message,
        timestamp: Date.now(),
        isSystem: true,
      });
    }

    // Уведомляем всех в комнате (включая инициатора) об изменении фона
    this.server.in(`room:${user.roomId}`).emit("room:backgroundChanged", {
      backgroundType,
      weather,
    });
  }

  private async joinRoom(client: Socket, user: any, roomId: number) {
    if (user.roomId) {
      void client.leave(`room:${user.roomId}`);
      void client.to(`room:${user.roomId}`).emit("user:leave", client.id);
    }

    user.roomId = roomId;
    user.x = 200 + Math.random() * 600;
    user.y = 0;

    void client.join(`room:${roomId}`);
    if (!user.isGuest) {
      await this.dbService.updateLastRoomId(user.id, roomId);
    }

    const room = await this.dbService.getRoomById(roomId);
    const roomData = room
      ? {
          id: room.id,
          name: room.name,
          creatorId: room.creatorId,
          maxUsers: room.maxUsers,
          online: this.onlineUsersService.getByRoom(roomId).length,
          backgroundType: room.backgroundType ?? "grass",
          weather: room.weather ?? "clear",
        }
      : { id: roomId, name: "Room", creatorId: null, maxUsers: 20, online: 0, backgroundType: "grass" as const, weather: "clear" as const };

    const usersInRoom = this.onlineUsersService.getByRoom(roomId);
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

    client.to(`room:${roomId}`).emit("user:join", user);
    void this.handleRoomList(client);
  }
}
