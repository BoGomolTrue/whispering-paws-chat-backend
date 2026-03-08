import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { DatabaseModule } from "../database/database.module";
import { PaymentModule } from "../payment/payment.module";
import { ShopModule } from "../shop/shop.module";
import { RoomsGateway } from "./rooms.gateway";

@Module({
  imports: [DatabaseModule, AuthModule, ShopModule, PaymentModule],
  providers: [RoomsGateway, WsJwtGuard],
  exports: [RoomsGateway],
})
export class RoomsModule {}
