import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import * as cookieParser from "cookie-parser";
import * as express from "express";
import * as fs from "fs";
import * as path from "path";
import { AppModule } from "./app.module";
import { SocketIoAdapter } from "./socket-io.adapter";

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

  app.useWebSocketAdapter(new SocketIoAdapter(app));

  const httpAdapter = app.getHttpAdapter();
  const expressApp = httpAdapter.getInstance();
  expressApp.use(
    "/uploads",
    express.static(path.join(process.cwd(), "public", "uploads"), {
      setHeaders: (res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
      },
    }),
  );

  const allowedOrigins = [
    "https://prod-app.vk-apps.com",
    "https://dev.vk.com",
    "https://vk.com",
    "https://*.vk.com",
    "https://whispering-paws.ru",
    "https://games.yandex.ru",
    "https://yandex.ru",
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
      )
        return callback(null, origin);
      if (
        /^https:\/\/([a-z0-9-]+\.)*yandex\.(ru|com|net)(:\d+)?$/i.test(origin) ||
        /^https:\/\/[a-z0-9-]+\.games\.s3\.yandex\.net$/i.test(origin)
      ) {
        return callback(null, origin);
      }
      const allowed = allowedOrigins.some((o: string) =>
        origin.startsWith(o.replace("*", "")),
      );
      callback(null, allowed ? origin : false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  });

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

  await app.listen(port, listenHost);
  Logger.log(
    `Application is running on: http://localhost:${port}`,
    "Bootstrap",
  );
}

void bootstrap();
