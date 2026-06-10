import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { BotsModule } from "../bots/bots.module";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { DatabaseModule } from "../database/database.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ShopController } from "./shop.controller";
import { ShopGateway } from "./shop.gateway";
import { ShopService } from "./shop.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    NotificationsModule,
    BotsModule,
    AiModule,
  ],
  controllers: [ShopController],
  providers: [ShopService, ShopGateway, WsJwtGuard],
  exports: [ShopService],
})
export class ShopModule {}
