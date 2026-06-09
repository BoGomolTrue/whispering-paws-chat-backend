import { Injectable, Logger } from "@nestjs/common";
import { Socket } from "socket.io";
import { getSalaryCooldownRemain } from "../common/utils/salary.util";
import { DatabaseService } from "../database/database.service";

export const NOTIFICATION_TYPE_SALARY = "salary_available";
export const NOTIFICATION_TYPE_GIFT = "gift_received";

export interface NotificationDto {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

interface SalaryUserState {
  id: number;
  lastSalaryAt: number;
  salaryClaimCount: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private salaryTimers = new Map<number, NodeJS.Timeout>();

  constructor(private dbService: DatabaseService) {}

  clearSchedule(userId: number): void {
    const timer = this.salaryTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.salaryTimers.delete(userId);
    }
  }

  async syncUserNotifications(
    client: Socket,
    user: SalaryUserState,
  ): Promise<void> {
    if (!user?.id) return;
    this.clearSchedule(user.id);
    const list = await this.dbService.getNotifications(user.id);
    client.emit("notifications:list", { items: list });
    await this.ensureSalaryNotification(client, user);
    this.scheduleSalaryNotification(client, user);
  }

  async onSalaryClaimed(client: Socket, user: SalaryUserState): Promise<void> {
    await this.dbService.deleteNotificationsByType(
      user.id,
      NOTIFICATION_TYPE_SALARY,
    );
    const list = await this.dbService.getNotifications(user.id);
    client.emit("notifications:list", { items: list });
    this.clearSchedule(user.id);
    this.scheduleSalaryNotification(client, user);
  }

  private async ensureSalaryNotification(
    client: Socket,
    user: SalaryUserState,
  ): Promise<void> {
    const remain = getSalaryCooldownRemain(
      user.lastSalaryAt,
      user.salaryClaimCount,
    );
    if (remain > 0) return;

    const existing = await this.dbService.findUnreadNotification(
      user.id,
      NOTIFICATION_TYPE_SALARY,
    );
    if (existing) return;

    const notification = await this.dbService.createNotification(
      user.id,
      NOTIFICATION_TYPE_SALARY,
    );
    client.emit("notification:new", notification);
    const list = await this.dbService.getNotifications(user.id);
    client.emit("notifications:list", { items: list });
  }

  private scheduleSalaryNotification(
    client: Socket,
    user: SalaryUserState,
  ): void {
    const remain = getSalaryCooldownRemain(
      user.lastSalaryAt,
      user.salaryClaimCount,
    );
    if (remain <= 0) return;

    const timer = setTimeout(() => {
      this.salaryTimers.delete(user.id);
      void this.fireSalaryNotification(client, user);
    }, remain + 500);

    this.salaryTimers.set(user.id, timer);
  }

  private async fireSalaryNotification(
    client: Socket,
    user: SalaryUserState,
  ): Promise<void> {
    if (!client.connected) return;

    const remain = getSalaryCooldownRemain(
      user.lastSalaryAt,
      user.salaryClaimCount,
    );
    if (remain > 0) {
      this.scheduleSalaryNotification(client, user);
      return;
    }

    const existing = await this.dbService.findUnreadNotification(
      user.id,
      NOTIFICATION_TYPE_SALARY,
    );
    if (existing) return;

    const notification = await this.dbService.createNotification(
      user.id,
      NOTIFICATION_TYPE_SALARY,
    );
    client.emit("notification:new", notification);
    const list = await this.dbService.getNotifications(user.id);
    client.emit("notifications:list", { items: list });
  }

  async markRead(
    userId: number,
    notificationId: number,
  ): Promise<NotificationDto[]> {
    const notification = await this.dbService.getNotificationById(
      notificationId,
      userId,
    );
    if (notification?.type === NOTIFICATION_TYPE_SALARY) {
      await this.dbService.deleteNotification(notificationId, userId);
    } else {
      await this.dbService.markNotificationRead(notificationId, userId);
    }
    return this.dbService.getNotifications(userId);
  }

  async markAllRead(userId: number): Promise<NotificationDto[]> {
    await this.dbService.deleteNotificationsByType(
      userId,
      NOTIFICATION_TYPE_SALARY,
    );
    await this.dbService.markAllNotificationsRead(userId);
    return this.dbService.getNotifications(userId);
  }

  async dismiss(
    userId: number,
    notificationId: number,
  ): Promise<NotificationDto[]> {
    await this.dbService.deleteNotification(notificationId, userId);
    return this.dbService.getNotifications(userId);
  }

  async onGiftReceived(
    client: Socket,
    userId: number,
    payload: { fromNickname: string; itemId: string; itemName: string; fromUserId: number },
  ): Promise<void> {
    await this.pushNotification(client, userId, NOTIFICATION_TYPE_GIFT, payload);
  }

  private async pushNotification(
    client: Socket,
    userId: number,
    type: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    const notification = await this.dbService.createNotification(
      userId,
      type,
      payload,
    );
    client.emit("notification:new", notification);
    const list = await this.dbService.getNotifications(userId);
    client.emit("notifications:list", { items: list });
  }
}
