import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Socket } from "socket.io";
import { AuthService } from "../../auth/auth.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private dbService: DatabaseService,
  ) {}

  async authenticateConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) throw new Error("AUTH_REQUIRED");
    const payload = this.authService.verifyToken(token);
    if (!payload) throw new Error("AUTH_REQUIRED");
    if (
      payload.guest &&
      payload.guestId != null &&
      payload.nickname &&
      payload.characterType
    ) {
      client.data.user = payload;
      client.data.isGuest = true;
      return;
    }
    if (!payload.userId) throw new Error("AUTH_REQUIRED");
    const userData = await this.dbService.loadUserForSocket(payload.userId);
    if (!userData || userData.banned) {
      throw new Error(userData?.banned ? "BANNED" : "AUTH_REQUIRED");
    }
    client.data.user = { userId: payload.userId, ...userData };
    client.data.isGuest = false;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = this.extractToken(client);

    if (!token) {
      throw new Error("AUTH_REQUIRED");
    }

    const payload = this.authService.verifyToken(token);
    if (!payload) {
      throw new Error("AUTH_REQUIRED");
    }

    await this.authenticateConnection(client);
    return true;
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (authToken) return authToken;

    const cookie = client.handshake.headers.cookie;
    if (cookie) {
      const match = cookie.match(/(?:^|;\s*)token=([^;]*)/);
      if (match?.[1]) return match[1];
    }
    return undefined;
  }
}
