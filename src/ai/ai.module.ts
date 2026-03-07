import { Module } from "@nestjs/common";
import { BotsModule } from "../bots/bots.module";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseModule } from "../database/database.module";
import { AiService } from "./ai.service";

@Module({
  imports: [BotsModule, DatabaseModule],
  providers: [AiService, OnlineUsersService],
  exports: [AiService],
})
export class AiModule {}
