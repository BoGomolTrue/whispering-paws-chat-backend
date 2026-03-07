import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

export interface JwtPayload {
  userId?: number;
  guest?: boolean;
  guestId?: number;
  nickname?: string;
  characterType?: string;
  gender?: string;
}

export interface GuestPayload {
  guestId: number;
  nickname: string;
  characterType: string;
  gender: string;
}

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  signToken(userId: number): string {
    const secret =
      this.configService.get<string>("JWT_SECRET") || "fallback-secret";
    return this.jwtService.sign({ userId }, { secret, expiresIn: "30d" });
  }

  signGuestToken(payload: GuestPayload): string {
    const secret =
      this.configService.get<string>("JWT_SECRET") || "fallback-secret";
    return this.jwtService.sign(
      { guest: true, ...payload },
      { secret, expiresIn: "7d" },
    );
  }

  verifyToken(token: string): JwtPayload | null {
    const secret =
      this.configService.get<string>("JWT_SECRET") || "fallback-secret";
    try {
      return this.jwtService.verify(token, { secret });
    } catch {
      return null;
    }
  }
}
