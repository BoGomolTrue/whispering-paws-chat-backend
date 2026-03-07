import { Injectable, Logger } from "@nestjs/common";
import { Server } from "socket.io";

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
}

@Injectable()
export class OnlineUsersService {
  private readonly logger = new Logger(OnlineUsersService.name);
  private users: Map<string, OnlineUser> = new Map();
  private io: Server | null = null;

  setIo(io: Server) {
    this.io = io;
  }

  add(socketId: string, user: OnlineUser): void {
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
    this.users.set(socketId, user);
  }

  remove(socketId: string): void {
    this.users.delete(socketId);
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
