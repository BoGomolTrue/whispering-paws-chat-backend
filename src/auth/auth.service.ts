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
    const parsed = this.verifyYandexSignedMessage(signature, "player");
    if (!parsed) return null;
    const payload = (parsed.data as Record<string, unknown> | undefined) ?? parsed;
    const id =
      (payload.uniqueID as string | undefined) ??
      (payload.uniqueId as string | undefined);
    return id ? String(id) : null;
  }

  verifyYandexSignedMessage(
    signature: string,
    kind: "player" | "payments" = "player",
  ): Record<string, unknown> | null {
    const secret =
      kind === "payments"
        ? this.configService.get<string>("YANDEX_PAYMENTS_SECRET") ||
          this.configService.get<string>("YANDEX_SECRET") ||
          ""
        : this.configService.get<string>("YANDEX_SECRET") || "";
    if (!secret) return null;
    const dot = signature.indexOf(".");
    if (dot <= 0) return null;
    const sign = signature.slice(0, dot);
    const data = signature.slice(dot + 1);
    const message = Buffer.from(data, "base64").toString("utf8");
    const hmac = crypto.createHmac("sha256", secret).update(message).digest("base64");
    if (sign !== hmac) return null;
    try {
      return JSON.parse(message) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
