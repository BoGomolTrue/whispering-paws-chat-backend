import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { DatabaseModule } from "../database/database.module";
import { FilesModule } from "../files/files.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentModule } from "../payment/payment.module";
import { ShopModule } from "../shop/shop.module";
import { RoomsGateway } from "./rooms.gateway";

@Module({
  imports: [DatabaseModule, AuthModule, ShopModule, PaymentModule, NotificationsModule, FilesModule],
  providers: [RoomsGateway, WsJwtGuard],
  exports: [RoomsGateway],
})
export class RoomsModule {}
