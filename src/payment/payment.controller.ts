import {
  Body,
  Controller,
  ForbiddenException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { PaymentService } from "./payment.service";

@Controller("api/payment")
export class PaymentController {
  constructor(
    private paymentService: PaymentService,
    private authService: AuthService,
    private dbService: DatabaseService,
  ) {}

  @Post("vk")
  async handleVk(@Body() body: string, @Res() res: Response) {
    const result = await this.paymentService.processVkPayment(body);
    res.status(HttpStatus.OK).json(result);
  }

  @Post("yoomoney")
  async handleYoomoney(@Body() body: string, @Res() res: Response) {
    await this.paymentService.processYoomoneyPayment(body);
    res.status(HttpStatus.OK).send();
  }

  @Post("tg/invoice")
  async handleTgInvoice(
    @Body() body: { packageId: string; telegramId: string },
    @Res() res: Response,
  ) {
    const result = await this.paymentService.processTgInvoice(
      body.packageId,
      body.telegramId,
    );
    if (result.error) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: result.error });
    } else {
      res.status(HttpStatus.OK).json({ url: result.url });
    }
  }

  @Post("tg/webhook")
  async handleTgWebhook(@Body() body: any, @Res() res: Response) {
    await this.paymentService.processTgWebhook(body);
    res.status(HttpStatus.OK).send();
  }

  @Post("tg/refund")
  async handleTgRefund(
    @Req() req: Request,
    @Body() body: { telegramId?: string; chargeId?: string; coins?: number },
    @Res() res: Response,
  ) {
    const token =
      (req.cookies?.token as string) ||
      (req.headers.authorization?.replace(/^Bearer\s+/i, "") as string);
    if (!token) {
      throw new UnauthorizedException("Unauthorized");
    }
    const payload = this.authService.verifyToken(token);
    if (!payload?.userId) {
      throw new UnauthorizedException("Unauthorized");
    }
    const admin = await this.dbService.getUserById(payload.userId);
    if (!admin || admin.role !== "admin") {
      throw new ForbiddenException("Admin only");
    }
    const { telegramId, chargeId, coins } = body ?? {};
    if (!telegramId || !chargeId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: "Missing telegramId or chargeId" });
    }
    const result = await this.paymentService.processTgRefund(
      telegramId,
      chargeId,
      coins,
    );
    if (!result.ok) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: result.error });
    }
    return res.status(HttpStatus.OK).json({ ok: true });
  }
}
