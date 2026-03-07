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
import { DailyService } from "./daily.service";

@WebSocketGateway()
@UseGuards(WsJwtGuard)
export class DailyGateway {
  private readonly logger = new Logger(DailyGateway.name);

  constructor(
    private dailyService: DailyService,
    private onlineUsersService: OnlineUsersService,
  ) {}

  @SubscribeMessage("daily:get")
  async handleGetDaily(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) return;

    const daily = await this.dailyService.getDailyState(user.id);
    client.emit("daily:data", daily);
  }

  @SubscribeMessage("daily:claimStreak")
  async handleClaimStreak(@ConnectedSocket() client: Socket) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest) return;

    const result = await this.dailyService.claimStreak(user.id);
    if (result) {
      client.emit("daily:streakClaimed", {
        coins: result.coins,
        streakDays: result.streakDays,
      });
    }
  }

  @SubscribeMessage("daily:claimQuest")
  async handleClaimQuest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { questId?: string },
  ) {
    const user = this.onlineUsersService.get(client.id);
    if (!user || user.isGuest || !data?.questId) return;

    const result = await this.dailyService.claimQuestReward(
      user.id,
      data.questId,
    );
    if (result) {
      const daily = await this.dailyService.getDailyState(user.id);
      client.emit("daily:questClaimed", {
        questId: data.questId,
        coins: result.coins,
        daily,
      });
    }
  }
}
