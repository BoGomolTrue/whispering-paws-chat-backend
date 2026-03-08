import { Global, Module } from "@nestjs/common";
import { OnlineUsersService } from "./services/online-users.service";
import { RateLimitService } from "./services/rate-limit.service";

@Global()
@Module({
  providers: [OnlineUsersService, RateLimitService],
  exports: [OnlineUsersService, RateLimitService],
})
export class CommonModule {}
