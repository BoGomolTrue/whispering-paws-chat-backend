import { NestFactory } from "@nestjs/core";
import { getConnectionToken } from "@nestjs/sequelize";
import { Sequelize } from "sequelize";
import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const sequelize = app.get<Sequelize>(getConnectionToken());
  await sequelize.sync();
  const db = app.get(DatabaseService);
  await db.seedSettings();
  await db.seedRanks();
  await db.ensureDefaultRoom();
  await db.ensureGuestRoom();
  await app.close();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
