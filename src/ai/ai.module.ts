import { Module } from "@nestjs/common";
import { BotsModule } from "../bots/bots.module";
import { DatabaseModule } from "../database/database.module";
import { AiService } from "./ai.service";

@Module({
  imports: [BotsModule, DatabaseModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
