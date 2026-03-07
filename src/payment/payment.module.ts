import { Module } from "@nestjs/common";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseModule } from "../database/database.module";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";

@Module({
  imports: [DatabaseModule],
  controllers: [PaymentController],
  providers: [PaymentService, OnlineUsersService],
  exports: [PaymentService],
})
export class PaymentModule {}
