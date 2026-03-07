import { SequelizeModuleOptions } from "@nestjs/sequelize";

export const databaseConfig = (): SequelizeModuleOptions => ({
  dialect: "postgres",
  uri: process.env.DATABASE_URL,
  autoLoadModels: true,
  synchronize: process.env.NODE_ENV !== "production",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});
