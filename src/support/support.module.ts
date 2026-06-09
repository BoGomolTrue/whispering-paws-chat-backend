import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { SupportController } from "./support.controller";

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [SupportController],
})
export class SupportModule {}
