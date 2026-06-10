import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { OnlineUsersService } from "../common/services/online-users.service";
import { getAuthTokenFromRequest } from "../common/utils/auth-token.util";
import { DatabaseService } from "../database/database.service";
import { ShopService } from "./shop.service";

@Controller("api/shop")
export class ShopController {
  constructor(
    private shopService: ShopService,
    private authService: AuthService,
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
  ) {}

  private async requireUser(req: Request) {
    const token = getAuthTokenFromRequest(req);
    if (!token) throw new UnauthorizedException();
    const payload = this.authService.verifyToken(token);
    if (!payload?.userId) throw new UnauthorizedException();
    const user = await this.dbService.getUserById(payload.userId);
    if (!user) throw new UnauthorizedException();
    if (user.isGuest) throw new ForbiddenException("GUEST_NOT_ALLOWED");
    return user;
  }

  @Get("items")
  getItems() {
    return this.shopService.getItems();
  }

  @Post("promo/redeem")
  @HttpCode(HttpStatus.OK)
  async redeemPromo(@Req() req: Request, @Body() body: { code?: string }) {
    const user = await this.requireUser(req);
    const code = (body.code ?? "").trim();
    if (!code) throw new BadRequestException("PROMO_INVALID");
    try {
      const result = await this.dbService.redeemPromoCode(user.id, code);
      this.onlineUsersService.updateCoins(user.id, result.coins);
      return {
        ok: true,
        coins: result.coins,
        reward: result.reward,
        code: result.code,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PROMO_INVALID";
      throw new BadRequestException(msg);
    }
  }
}
