import { Module } from "@nestjs/common";
import { BotsService } from "./bots.service";
// Gateway будет создан позже, пока экспортируем только сервис
@Module({
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
