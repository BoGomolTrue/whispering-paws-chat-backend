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
    const raw = client.data.user;
    if (!raw) return;

    const isGuest = !!raw.guest;
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
            (raw.equippedColors as Record<string, string | null>)?.[k] ?? null;
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
      inventoryValue: this.shopService.calcInventoryValue(raw.ownedItems ?? []),
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

    this.onlineUsersService.add(client.id, onlineUser as any);
    this.logger.log(`Client connected: ${client.id} (${onlineUser.nickname})`);
    await this.joinRoom(client, onlineUser as any, startRoomId);
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

  private getSalaryCooldownRemain(user: any): number {
    const base = 5 * 60 * 1000;
    const extra = 30 * 1000;
    const cd = base + (user.salaryClaimCount || 0) * extra;
    return Math.max(0, cd - (Date.now() - (user.lastSalaryAt || 0)));
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
        }
      : { id: roomId, name: "Room", creatorId: null, maxUsers: 20, online: 0 };

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
