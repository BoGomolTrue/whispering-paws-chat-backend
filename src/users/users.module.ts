import { Module } from "@nestjs/common";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseModule } from "../database/database.module";
import { UsersService } from "./user.service";

@Module({
  imports: [DatabaseModule],
  providers: [UsersService, OnlineUsersService],
  exports: [UsersService],
})
export class UsersModule {}
