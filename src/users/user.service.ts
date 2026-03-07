import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class UsersService {
  constructor(
    private dbService: DatabaseService,
    private onlineUsersService: OnlineUsersService,
  ) {}

  async updateProfile(userId: number, updates: any) {
    await this.dbService.updateUserProfile(userId, updates);
    // Обновляем данные в памяти если пользователь онлайн
    const user = this.onlineUsersService.getById(userId);
    if (user) {
      Object.assign(user, updates);
    }
  }

  async changePassword(userId: number, oldPass: string, newPass: string) {
    // Логика проверки пароля должна быть в AuthModule или здесь с доступом к хешу
    // Для краткости опущена, так как требует доступа к сырому хешу из БД
    const user = await this.dbService.getUserById(userId);
    if (!user || !user.password) throw new Error("User not found");

    const valid = await bcrypt.compare(oldPass, user.password);
    if (!valid) throw new Error("Invalid password");

    const hash = await bcrypt.hash(newPass, 10);
    await this.dbService.changePassword(userId, hash);
  }
}
