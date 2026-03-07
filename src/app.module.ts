import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { BotsModule } from "./bots/bots.module";
import { ChatModule } from "./chat/chat.module";
import { OnlineUsersService } from "./common/services/online-users.service";
import { RateLimitService } from "./common/services/rate-limit.service";
import { DailyModule } from "./daily/daily.module";
import { DatabaseModule } from "./database/database.module";
import { FilesModule } from "./files/files.module";
import { PaymentModule } from "./payment/payment.module";
import { RoomsModule } from "./rooms/rooms.module";
import { ShopModule } from "./shop/shop.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    RoomsModule,
    ChatModule,
    ShopModule,
    PaymentModule,
    DailyModule,
    BotsModule,
    AiModule,
    FilesModule,
  ],
  providers: [OnlineUsersService, RateLimitService],
})
export class AppModule {}
