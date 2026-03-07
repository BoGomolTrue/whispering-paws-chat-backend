import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { Response } from "express";
import { PaymentService } from "./payment.service";

@Controller("api/payment")
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

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
}
