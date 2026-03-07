import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { Request, Response } from "express";
import { DatabaseService } from "../database/database.service";
import { AuthService } from "./auth.service";
import { GuestLoginDto, LoginDto, RegisterDto } from "./dto/login.dto";

function setTokenCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

@Controller("api/auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private dbService: DatabaseService,
    private configService: ConfigService,
  ) {}

  @Get("me")
  async me(@Req() req: Request, @Res() res: Response) {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ user: null });
    }
    const payload = this.authService.verifyToken(token);
    if (!payload) {
      res.cookie("token", "", { httpOnly: true, path: "/", maxAge: 0 });
      return res.status(401).json({ user: null });
    }
    if (
      payload.guest &&
      payload.guestId != null &&
      payload.nickname &&
      payload.characterType
    ) {
      res.cookie("token", "", { httpOnly: true, path: "/", maxAge: 0 });
      return res.status(401).json({ user: null });
    }
    if (!payload.userId) {
      return res.status(401).json({ user: null });
    }
    const user = await this.dbService.getUserById(payload.userId);
    if (!user) {
      return res.status(401).json({ user: null });
    }
    if (user.banned) {
      res.cookie("token", "", { httpOnly: true, path: "/", maxAge: 0 });
      return res.status(403).json({ error: "BANNED" });
    }
    return res.json({
      user: {
        id: user.id,
        nickname: user.nickname,
        characterType: user.characterType,
        email: (user as any).email,
        coins: user.coins,
        eyeColor: user.eyeColor,
        banned: user.banned,
        role: user.role,
      },
    });
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  logout(@Res() res: Response) {
    res.cookie("token", "", { httpOnly: true, path: "/", maxAge: 0 });
    return res.json({ ok: true });
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    console.log("TEST DATA", "qwe");
    const user = await this.dbService.findUserByEmail(dto.email);
    if (!user) throw new BadRequestException("Invalid email or password");
    const u = user.get({ plain: true }) as {
      password: string;
      banned: boolean;
      id: number;
      nickname: string;
    };
    if (u.banned) throw new BadRequestException("Account banned");
    const valid = await bcrypt.compare(dto.password, u.password);
    if (!valid) throw new BadRequestException("Invalid email or password");
    const token = this.authService.signToken(u.id);
    setTokenCookie(res, token);
    return res.json({ token, user: { id: u.id, nickname: u.nickname } });
  }

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const existing = await this.dbService.findUserByEmail(dto.email);
    if (existing) throw new BadRequestException("Email already registered");
    const nickExists = await this.dbService.findUserByNickname(
      dto.nickname.trim(),
    );
    if (nickExists) throw new BadRequestException("Nickname already taken");
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const newUser = await this.dbService.createUser({
      email: dto.email,
      password: hashedPassword,
      nickname: dto.nickname.trim(),
      characterType: dto.characterType,
      gender: dto.gender,
    });
    const token = this.authService.signToken(newUser.id);
    setTokenCookie(res, token);
    return res.json({
      token,
      user: { id: newUser.id, nickname: newUser.nickname },
    });
  }

  @Post("guest")
  @HttpCode(HttpStatus.OK)
  guestLogin(@Body() dto: GuestLoginDto, @Res() res: Response) {
    const guestId = -Math.floor(Math.random() * 100000);
    const token = this.authService.signGuestToken({
      guestId,
      nickname: dto.nickname,
      characterType: dto.characterType,
      gender: dto.gender,
    });
    setTokenCookie(res, token);
    return res.json({
      token,
      user: {
        id: guestId,
        nickname: dto.nickname,
        characterType: dto.characterType,
        isGuest: true,
      },
    });
  }

  @Post("vk")
  @HttpCode(HttpStatus.OK)
  async vk(
    @Body() body: { sign?: string; signParams?: Record<string, unknown> },
    @Res() res: Response,
  ) {
    const { sign, signParams } = body;
    const secret = this.configService.get<string>("VK_APP_SECRET") || "";
    if (!secret) {
      throw new BadRequestException("VK auth not configured");
    }
    if (!sign || !signParams) {
      throw new BadRequestException("Missing sign or signParams");
    }
    const vkParams: Record<string, string> = {};
    for (const [key, val] of Object.entries(signParams)) {
      if (key.startsWith("vk_")) vkParams[key] = String(val);
    }
    const urlParams = new URLSearchParams(vkParams);
    urlParams.sort();
    const hash = crypto
      .createHmac("sha256", secret)
      .update(urlParams.toString())
      .digest("base64url");
    if (hash !== sign) {
      throw new BadRequestException("Invalid VK signature");
    }
    const vkUserId = signParams.vk_user_id;
    if (!vkUserId) {
      throw new BadRequestException("Missing vk_user_id");
    }
    const vkId =
      typeof vkUserId === "number" ? vkUserId : parseInt(String(vkUserId), 10);
    let user = await this.dbService.findUserByVkId(vkId);
    let isNew = false;
    if (!user) {
      isNew = true;
      const randomSuffix = crypto.randomBytes(3).toString("hex");
      const nickname = `user_${randomSuffix}`;
      const fakeEmail = `vk_${vkId}@wp.local`;
      const fakePassword = await bcrypt.hash(
        crypto.randomBytes(32).toString("hex"),
        10,
      );
      const vkSex = signParams.vk_sex;
      const gender = vkSex === 1 || vkSex === "1" ? "female" : "male";
      user = await this.dbService.createUser({
        email: fakeEmail,
        password: fakePassword,
        nickname,
        characterType: "cat",
        gender,
        vkId,
      });
      await this.dbService.addOwnedItem(user.id, "sparkle");
    }
    const plain = user.get({ plain: true }) as {
      banned: boolean;
      id: number;
      nickname: string;
      characterType: string;
    };
    if (plain.banned) {
      throw new BadRequestException("BANNED");
    }
    const token = this.authService.signToken(plain.id);
    setTokenCookie(res, token);
    return res.json({
      ok: true,
      token,
      isNew,
      user: {
        id: plain.id,
        nickname: plain.nickname,
        characterType: plain.characterType,
      },
    });
  }

  @Post("tg")
  @HttpCode(HttpStatus.OK)
  async tg(@Body() body: { initData?: string }, @Res() res: Response) {
    const { initData } = body;
    const botToken = this.configService.get<string>("TG_BOT_TOKEN") || "";
    if (!botToken) {
      throw new BadRequestException("TG auth not configured");
    }
    if (!initData) {
      throw new BadRequestException("Missing initData");
    }
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      throw new BadRequestException("Invalid Telegram signature");
    }
    params.delete("hash");
    const entries = Array.from(params.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();
    const expected = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");
    if (expected !== hash) {
      throw new BadRequestException("Invalid Telegram signature");
    }
    let telegramId: string;
    try {
      const userData = JSON.parse(params.get("user") || "");
      telegramId = String(userData.id);
    } catch {
      throw new BadRequestException("Invalid Telegram signature");
    }
    let user = await this.dbService.findUserByTelegramId(telegramId);
    let isNew = false;
    if (!user) {
      isNew = true;
      const randomSuffix = crypto.randomBytes(3).toString("hex");
      const nickname = `user_${randomSuffix}`;
      const fakeEmail = `tg_${telegramId}@wp.local`;
      const fakePassword = await bcrypt.hash(
        crypto.randomBytes(32).toString("hex"),
        10,
      );
      user = await this.dbService.createUser({
        email: fakeEmail,
        password: fakePassword,
        nickname,
        characterType: "cat",
        gender: "male",
        telegramId,
      });
      await this.dbService.addOwnedItem(user.id, "sparkle");
    }
    const plain = user.get({ plain: true }) as {
      banned: boolean;
      id: number;
      nickname: string;
      characterType: string;
    };
    if (plain.banned) {
      throw new BadRequestException("BANNED");
    }
    const token = this.authService.signToken(plain.id);
    setTokenCookie(res, token);
    return res.json({
      ok: true,
      token,
      isNew,
      user: {
        id: plain.id,
        nickname: plain.nickname,
        characterType: plain.characterType,
      },
    });
  }
}
