import { Module } from "@nestjs/common";
import { BotsService } from "./bots.service";

@Module({
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
