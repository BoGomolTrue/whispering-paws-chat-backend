import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BotsModule } from "../bots/bots.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminController } from "./admin.controller";

@Module({
  imports: [AuthModule, BotsModule, NotificationsModule],
  controllers: [AdminController],
})
export class AdminModule {}
