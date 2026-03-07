import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";

const SOCKET_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://prod-app.vk-apps.com",
  "https://dev.vk.com",
  "https://vk.com",
  "https://whispering-paws.ru",
];

export class SocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    const opts = {
      ...options,
      cors: {
        origin: (
          origin: string,
          callback: (err: Error | null, allow?: boolean | string) => void,
        ) => {
          if (!origin) return callback(null, true);
          const allowed =
            origin.startsWith("http://localhost") ||
            origin.startsWith("http://127.0.0.1") ||
            SOCKET_CORS_ORIGINS.includes(origin);
          callback(null, allowed ? origin : false);
        },
        credentials: true,
      },
    };
    return super.createIOServer(port, opts);
  }
}
