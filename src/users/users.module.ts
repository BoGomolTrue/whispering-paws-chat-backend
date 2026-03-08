import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { DatabaseModule } from "../database/database.module";
import { FilesModule } from "../files/files.module";
import { UsersGateway } from "./users.gateway";
import { UsersService } from "./user.service";

@Module({
  imports: [DatabaseModule, AuthModule, FilesModule],
  providers: [UsersService, UsersGateway, WsJwtGuard],
  exports: [UsersService],
})
export class UsersModule {}
