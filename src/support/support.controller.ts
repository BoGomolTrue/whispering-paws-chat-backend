import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { getAuthTokenFromRequest } from "../common/utils/auth-token.util";
import { DatabaseService } from "../database/database.service";
import { FilesService } from "../files/files.service";

const SUPPORT_CATEGORIES = new Set(["bug", "suggestion", "other"]);

@Controller("api/support")
export class SupportController {
  constructor(
    private authService: AuthService,
    private dbService: DatabaseService,
    private filesService: FilesService,
  ) {}

  private async requireUser(req: Request) {
    const token = getAuthTokenFromRequest(req);
    if (!token) throw new UnauthorizedException();
    const payload = this.authService.verifyToken(token);
    if (!payload?.userId) throw new UnauthorizedException();
    const user = await this.dbService.getUserById(payload.userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  @Get()
  async listMine(@Req() req: Request) {
    const user = await this.requireUser(req);
    const items = await this.dbService.listSupportMessagesForUser(user.id);
    return { items };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: Request,
    @Body()
    body: { category?: string; message?: string; imageDataUrl?: string },
  ) {
    const user = await this.requireUser(req);
    const category = (body.category ?? "").trim();
    const message = (body.message ?? "").trim();
    const imageDataUrl =
      typeof body.imageDataUrl === "string" ? body.imageDataUrl.trim() : "";

    if (!SUPPORT_CATEGORIES.has(category)) {
      throw new BadRequestException("Invalid category");
    }
    if (message.length > 2000) {
      throw new BadRequestException("Message too long");
    }
    if (!imageDataUrl && message.length < 10) {
      throw new BadRequestException("Message too short");
    }

    const recent = await this.dbService.getLatestSupportMessageAt(user.id);
    if (recent && Date.now() - recent < 60_000) {
      throw new BadRequestException(
        "Please wait before sending another message",
      );
    }

    let imageUrl: string | null = null;
    if (imageDataUrl) {
      try {
        imageUrl = await this.filesService.saveSupportImage(
          imageDataUrl,
          user.id,
        );
      } catch {
        throw new BadRequestException("Invalid image");
      }
    }

    const item = await this.dbService.createSupportMessage(
      user.id,
      user.nickname,
      category,
      message,
      imageUrl,
    );

    return { ok: true, item };
  }
}
