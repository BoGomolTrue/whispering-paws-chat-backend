import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { DatabaseModule } from "../database/database.module";
import { ShopController } from "./shop.controller";
import { ShopGateway } from "./shop.gateway";
import { ShopService } from "./shop.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ShopController],
  providers: [ShopService, ShopGateway, WsJwtGuard],
  exports: [ShopService],
})
export class ShopModule {}
