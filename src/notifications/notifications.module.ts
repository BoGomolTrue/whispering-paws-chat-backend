import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { DatabaseModule } from "../database/database.module";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [NotificationsService, NotificationsGateway, WsJwtGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
