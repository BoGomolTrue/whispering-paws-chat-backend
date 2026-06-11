import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
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

  verifyYandexPlayerSignature(signature: string): string | null {
    const secret = this.configService.get<string>("YANDEX_SECRET") || "";
    if (!secret) return null;
    const dot = signature.indexOf(".");
    if (dot <= 0) return null;
    const sign = signature.slice(0, dot);
    const data = signature.slice(dot + 1);
    const message = Buffer.from(data, "base64").toString("utf8");
    const hmac = crypto.createHmac("sha256", secret).update(message).digest("base64");
    if (sign !== hmac) return null;
    try {
      const parsed = JSON.parse(message) as {
        data?: { uniqueID?: string; uniqueId?: string };
        uniqueID?: string;
        uniqueId?: string;
      };
      const payload = parsed.data ?? parsed;
      const id = payload.uniqueID ?? payload.uniqueId;
      return id ? String(id) : null;
    } catch {
      return null;
    }
  }
}
