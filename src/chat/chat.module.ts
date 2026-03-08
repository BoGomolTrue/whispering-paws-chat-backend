import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { DatabaseModule } from "../database/database.module";
import { FilesModule } from "../files/files.module";
import { ChatGateway } from "./chat.gateway";

@Module({
  imports: [DatabaseModule, AuthModule, AiModule, FilesModule],
  providers: [ChatGateway, WsJwtGuard],
})
export class ChatModule {}
