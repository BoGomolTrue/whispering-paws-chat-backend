import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { OnlineUsersService } from "../common/services/online-users.service";
import { RateLimitService } from "../common/services/rate-limit.service";
import { DatabaseModule } from "../database/database.module";
import { ChatGateway } from "./chat.gateway";

@Module({
  imports: [DatabaseModule, AuthModule, AiModule],
  providers: [ChatGateway, OnlineUsersService, RateLimitService, WsJwtGuard],
})
export class ChatModule {}
