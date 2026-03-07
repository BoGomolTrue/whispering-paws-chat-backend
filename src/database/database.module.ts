import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { SequelizeModule } from "@nestjs/sequelize";
import { DatabaseService } from "./database.service";
import { ChatMessage } from "./models/chat-message.model";
import { DirectMessage } from "./models/direct-message.model";
import { Rank } from "./models/rank.model";
import { Room } from "./models/room.model";
import { Setting } from "./models/settings.model";
import { UserDaily } from "./models/user-daily.model";
import { UserEquipped } from "./models/user-equipped.model";
import { UserItem } from "./models/user-item.model";
import { User } from "./models/user.model";

@Global()
@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        dialect: "postgres",
        uri: configService.get<string>("DATABASE_URL"),
        models: [
          User,
          UserItem,
          UserEquipped,
          Room,
          ChatMessage,
          DirectMessage,
          Setting,
          Rank,
          UserDaily,
        ],
        autoLoadModels: true,
        synchronize: configService.get("NODE_ENV") !== "production",
        logging:
          configService.get("NODE_ENV") === "development" ? console.log : false,
      }),
      inject: [ConfigService],
    }),
    SequelizeModule.forFeature([
      User,
      UserItem,
      UserEquipped,
      Room,
      ChatMessage,
      DirectMessage,
      Setting,
      Rank,
      UserDaily,
    ]),
  ],
  providers: [DatabaseService],
  exports: [SequelizeModule, DatabaseService],
})
export class DatabaseModule {}
