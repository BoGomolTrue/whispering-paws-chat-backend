import { Logger, UseGuards } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { Socket } from "socket.io";
import { WsJwtGuard } from "../common/guards/ws-jwt.guard";
import { OnlineUsersService } from "../common/services/online-users.service";
import { NotificationsService } from "./notifications.service";

@WebSocketGateway()
@UseGuards(WsJwtGuard)
export class NotificationsGateway {
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private notificationsService: NotificationsService,
    private onlineUsersService: OnlineUsersService,
  ) {}

  @SubscribeMessage("notifications:get")
  async handleGet(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) return;
    await this.notificationsService.syncUserNotifications(client, {
      id: user.id,
      lastSalaryAt: user.lastSalaryAt,
      salaryClaimCount: user.salaryClaimCount,
    });
  }

  @SubscribeMessage("notifications:read")
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { id?: number },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || !data?.id) return;
    const items = await this.notificationsService.markRead(user.id, data.id);
    client.emit("notifications:list", { items });
  }

  @SubscribeMessage("notifications:readAll")
  async handleReadAll(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) return;
    const items = await this.notificationsService.markAllRead(user.id);
    client.emit("notifications:list", { items });
  }
}
