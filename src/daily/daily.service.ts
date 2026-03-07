import { Injectable } from "@nestjs/common";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class DailyService {
  constructor(
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
  ) {}

  async getDailyState(userId: number) {
    return this.dbService.getDailyState(userId);
  }

  async claimStreak(userId: number) {
    const result = await this.dbService.claimStreak(userId);
    if (!result) return null;

    const user = this.onlineUsersService.getById(userId);
    if (user) {
      user.coins = result.coins;
    }
    return result;
  }

  async claimQuestReward(userId: number, questId: string) {
    const result = await this.dbService.claimQuestReward(userId, questId);
    if (!result) return null;

    const user = this.onlineUsersService.getById(userId);
    if (user) {
      user.coins = result.coins;
    }
    return { ...result, daily: await this.getDailyState(userId) };
  }
}
