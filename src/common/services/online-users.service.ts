import { Injectable, Logger } from "@nestjs/common";
import { Server } from "socket.io";
import { AFK_IDLE_MS } from "../constants/afk.constants";

export interface OnlineUser {
  id: number;
  socketId: string;
  nickname: string;
  roomId: number;
  x: number;
  y: number;
  emotion: string;
  coins: number;
  ownedItems: string[];
  equipped: Record<string, string | null>;
  equippedColors: Record<string, string | null>;
  characterType: string;
  gender: string | null;
  eyeColor: string | null;
  status: string | null;
  role: string;
  invisible?: boolean;
  lastSalaryAt: number;
  salaryClaimCount: number;
  inventoryValue: number;
  notificationsOff?: boolean;
  animationsOff?: boolean;
  isGuest?: boolean;
  anketa_about?: string | null;
  anketa_city?: string | null;
  anketa_interests?: string | null;
  anketa_looking_for?: string | null;
  anketa_age?: string | null;
  anketa_avatar?: string | null;
  isBot?: boolean;
  lastActiveAt: number;
  afk?: boolean;
}

@Injectable()
export class OnlineUsersService {
  private readonly logger = new Logger(OnlineUsersService.name);
  private users: Map<string, OnlineUser> = new Map();
  private io: Server | null = null;
  private userLocks: Map<number, Promise<void>> = new Map();
  private afkBySocket = new Map<string, boolean>();
  private afkTimer: ReturnType<typeof setInterval> | null = null;

  setIo(io: Server) {
    this.io = io;
  }

  startAfkWatcher() {
    if (this.afkTimer) return;
    this.afkTimer = setInterval(() => this.syncAfkStates(), 10_000);
  }

  touchActivity(socketId: string) {
    const user = this.users.get(socketId);
    if (!user) return;
    user.lastActiveAt = Date.now();
    if (user.afk) {
      user.afk = false;
      this.afkBySocket.set(socketId, false);
      this.emitAfk(user, false);
    }
  }

  markAway(socketId: string) {
    const user = this.users.get(socketId);
    if (!user) return;
    user.lastActiveAt = Date.now() - AFK_IDLE_MS - 1;
    this.applyAfk(user, true);
  }

  private syncAfkStates() {
    const now = Date.now();
    for (const [, user] of this.users) {
      if (!user.roomId || user.isBot) continue;
      const afk = now - user.lastActiveAt > AFK_IDLE_MS;
      this.applyAfk(user, afk);
    }
  }

  private applyAfk(user: OnlineUser, afk: boolean) {
    const prev = this.afkBySocket.get(user.socketId) ?? false;
    if (prev === afk) return;
    this.afkBySocket.set(user.socketId, afk);
    user.afk = afk;
    this.emitAfk(user, afk);
  }

  private emitAfk(user: OnlineUser, afk: boolean) {
    if (!this.io || !user.roomId || this.isAdminHidden(user, user.roomId)) return;
    const payload = { socketId: user.socketId, afk };
    this.io.to(`room:${user.roomId}`).emit("user:afk", payload);
  }

  async add(socketId: string, user: OnlineUser): Promise<void> {
    // Ждём, если есть активная блокировка для этого пользователя
    const lock = this.userLocks.get(user.id);
    if (lock) await lock;

    // Создаём новую блокировку
    const lockPromise = (async () => {
      const existing = Array.from(this.users.entries()).find(
        ([, u]) => u.id === user.id && !u.isBot,
      );
      if (existing && this.io) {
        const [oldSocketId, oldUser] = existing;
        const oldSocket = this.io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
          oldSocket.emit("force:disconnect", "duplicate");
          oldSocket.disconnect(true);
        }
        if (oldUser.roomId && !this.isAdminHidden(oldUser, oldUser.roomId)) {
          this.io.to(`room:${oldUser.roomId}`).emit("user:leave", oldSocketId);
        }
        this.users.delete(oldSocketId);
        this.logger.debug(
          `Kicked duplicate user ${oldUser.nickname} (${oldSocketId})`,
        );
      }
      const now = Date.now();
      this.users.set(socketId, {
        ...user,
        lastActiveAt: user.lastActiveAt ?? now,
        afk: false,
      });
      this.afkBySocket.set(socketId, false);
    })();

    this.userLocks.set(user.id, lockPromise);
    await lockPromise;
    this.userLocks.delete(user.id);
  }

  remove(socketId: string): void {
    this.users.delete(socketId);
    this.afkBySocket.delete(socketId);
  }

  get(socketId: string): OnlineUser | undefined {
    return this.users.get(socketId);
  }

  getById(userId: number): OnlineUser | undefined {
    return Array.from(this.users.values()).find((u) => u.id === userId);
  }

  getByRoom(roomId: number): OnlineUser[] {
    return Array.from(this.users.values()).filter((u) => u.roomId === roomId);
  }

  countsInRoomOnline(user: OnlineUser): boolean {
    return !(user.role === "admin" && user.invisible);
  }

  countRoomOnline(roomId: number): number {
    return this.getByRoom(roomId).filter((u) => this.countsInRoomOnline(u)).length;
  }

  getAll(): OnlineUser[] {
    return Array.from(this.users.values());
  }

  updateCoins(userId: number, coins: number): void {
    const user = this.getById(userId);
    if (user && this.io) {
      user.coins = coins;
      const socket = this.io.sockets.sockets.get(user.socketId);
      if (socket) {
        socket.emit("coins:updated", { coins });
      }
    }
  }

  isAdminHidden(user: OnlineUser | undefined, roomId: number): boolean {
    return !!(
      user &&
      user.role === "admin" &&
      (user.invisible || roomId !== 1)
    ); // Assuming 1 is default room
  }

  clear(): void {
    this.users.clear();
  }
}
