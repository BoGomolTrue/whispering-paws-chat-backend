import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { SocketIoAdapter } from "./socket-io.adapter";
import * as cookieParser from "cookie-parser";
import * as express from "express";
import * as fs from "fs";
import * as path from "path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  app.use(cookieParser());

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT") || 3000;
  const host = configService.get<string>("HOST") || "0.0.0.0";
  const listenHost = host === "localhost" ? "0.0.0.0" : host;

  // Настройка WebSocket адаптера
  app.useWebSocketAdapter(new SocketIoAdapter(app));

  // CORS настройки
  const allowedOrigins = [
    "https://prod-app.vk-apps.com",
    "https://dev.vk.com",
    "https://vk.com",
    "https://*.vk.com",
    "https://whispering-paws.ru",
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
      )
        return callback(null, origin);
      const allowed = allowedOrigins.some((o: string) =>
        origin.startsWith(o.replace("*", "")),
      );
      callback(null, allowed ? origin : false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  });

  // Глобальная валидация
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const httpAdapter = app.getHttpAdapter();
  const expressApp = httpAdapter.getInstance();
  expressApp.use(
    "/uploads",
    express.static(path.join(process.cwd(), "public", "uploads")),
  );

  await app.listen(port, listenHost);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}

void bootstrap();
