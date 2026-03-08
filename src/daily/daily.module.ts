import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { DatabaseModule } from "../database/database.module";
import { DailyGateway } from "./daily.gateway";
import { DailyService } from "./daily.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [DailyService, DailyGateway, WsJwtGuard],
  exports: [DailyService],
})
export class DailyModule {}
