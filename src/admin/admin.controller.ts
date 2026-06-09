import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { BADGE_IDS } from "../achievements/achievements.config";
import { AuthService } from "../auth/auth.service";
import { BotProfileInput } from "../bots/bot-profile.util";
import { BotsService } from "../bots/bots.service";
import { Bot } from "../database/models/bot.model";
import { OnlineUsersService } from "../common/services/online-users.service";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";
import { getShopItemById } from "../shop/shop.data.constant";

const BOT_ID_OFFSET = 900000;

function mapBotDto(b: Bot, roomName: string) {
  return {
    id: b.id,
    runtimeId: BOT_ID_OFFSET + b.id,
    nickname: b.nickname,
    roomId: b.roomId,
    roomName,
    characterType: b.characterType,
    gender: b.gender,
    eyeColor: b.eyeColor,
    socketId: b.socketId,
    status: b.status ?? "",
    coins: b.coins ?? 100,
    inventoryValue: b.inventoryValue ?? 0,
    badges: b.badges ?? [],
    ownedItems: b.ownedItems ?? [],
    equipped: b.equipped ?? {},
    anketa_about: b.anketa_about ?? "",
    anketa_city: b.anketa_city ?? "",
    anketa_interests: b.anketa_interests ?? "",
    anketa_age: b.anketa_age ?? "",
    anketa_looking_for: b.anketa_looking_for ?? "",
    statusPool: b.statusPool ?? [],
    hidden: !!b.hidden,
  };
}

type AdminActor = { id: number; nickname: string };

@Controller("api/admin")
export class AdminController {
  constructor(
    private authService: AuthService,
    private dbService: DatabaseService,
    private botsService: BotsService,
    private onlineUsersService: OnlineUsersService,
    private notificationsService: NotificationsService,
  ) {}

  private async requireAdmin(req: Request): Promise<AdminActor> {
    const token =
      (req.cookies?.token as string) ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) throw new UnauthorizedException();
    const payload = this.authService.verifyToken(token);
    if (!payload?.userId) throw new UnauthorizedException();
    const user = await this.dbService.getUserById(payload.userId);
    if (!user || user.role !== "admin") throw new ForbiddenException();
    return { id: user.id, nickname: user.nickname };
  }

  private async audit(
    admin: AdminActor,
    action: string,
    targetUserId: number | null,
    details: Record<string, unknown> = {},
    userLog?: { userId: number; message: string },
  ) {
    await this.dbService.writeAdminLog(
      admin.id,
      admin.nickname,
      action,
      targetUserId,
      details,
    );
    if (userLog) {
      await this.dbService.writeUserLog(
        userLog.userId,
        `admin_${action}`,
        userLog.message,
        details,
      );
    }
  }

  private syncOnlineBadges(userId: number, badges: string[]) {
    const online = this.onlineUsersService.getById(userId);
    if (online) online.badges = badges;
    const sock = this.onlineUsersService.getSocketForUser(userId);
    sock?.emit("badges:updated", { badges });
  }

  private syncOnlineItems(userId: number, ownedItems: string[]) {
    const online = this.onlineUsersService.getById(userId);
    if (!online) return;
    online.ownedItems = ownedItems;
    online.inventoryValue =
      this.dbService.calcInventoryValueFromIds(ownedItems);
  }

  private disconnectUser(
    userId: number,
    event: "force:banned" | "force:kicked" | null = null,
  ) {
    const sock = this.onlineUsersService.getSocketForUser(userId);
    if (sock) {
      if (event) sock.emit(event, null);
      sock.disconnect(true);
    }
  }

  @Get("rooms")
  async listRooms(@Req() req: Request) {
    await this.requireAdmin(req);
    const rooms = await this.dbService.getRooms();
    return rooms.map((r) => ({ id: r.id, name: r.name }));
  }

  @Get("bots")
  async listBots(@Req() req: Request) {
    await this.requireAdmin(req);
    const bots = await this.dbService.listBots();
    const rooms = await this.dbService.getRooms();
    const roomMap = new Map(rooms.map((r) => [r.id, r.name]));
    return bots.map((b) => mapBotDto(b, roomMap.get(b.roomId) ?? "?"));
  }

  @Post("bots")
  async createBot(@Req() req: Request, @Body() body: BotProfileInput) {
    const admin = await this.requireAdmin(req);
    const roomId = body.roomId;
    if (!roomId) throw new BadRequestException("roomId required");
    const room = await this.dbService.getRoomById(roomId);
    if (!room) throw new NotFoundException("Room not found");

    try {
      const bot = await this.dbService.createBot(body);
      await this.botsService.spawnBotRecord(bot);
      await this.audit(admin, "bot_create", null, {
        botId: bot.id,
        nickname: bot.nickname,
      });
      return { ok: true, id: bot.id, runtimeId: BOT_ID_OFFSET + bot.id };
    } catch {
      throw new BadRequestException("Invalid bot data");
    }
  }

  @Patch("bots/:id")
  async updateBot(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: BotProfileInput,
  ) {
    const admin = await this.requireAdmin(req);
    if (body.roomId) {
      const room = await this.dbService.getRoomById(body.roomId);
      if (!room) throw new NotFoundException("Room not found");
    }
    try {
      const bot = await this.dbService.updateBot(id, body);
      if (!bot) throw new NotFoundException();
      await this.botsService.refreshBotRecord(bot);
      await this.audit(admin, "bot_update", null, {
        botId: id,
        nickname: bot.nickname,
      });
      const rooms = await this.dbService.getRooms();
      const roomName =
        rooms.find((r) => r.id === bot.roomId)?.name ?? "?";
      return { ok: true, bot: mapBotDto(bot, roomName) };
    } catch {
      throw new BadRequestException("Invalid bot data");
    }
  }

  @Patch("bots/:id/hidden")
  async setBotHidden(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { hidden?: boolean },
  ) {
    const admin = await this.requireAdmin(req);
    const bot = await this.dbService.setBotHidden(id, !!body.hidden);
    if (!bot) throw new NotFoundException();
    await this.botsService.refreshBotRecord(bot);
    await this.audit(admin, "bot_hidden", null, {
      botId: id,
      hidden: !!body.hidden,
    });
    const rooms = await this.dbService.getRooms();
    const roomName = rooms.find((r) => r.id === bot.roomId)?.name ?? "?";
    return { ok: true, bot: mapBotDto(bot, roomName) };
  }

  @Delete("bots/:id")
  async deleteBot(@Req() req: Request, @Param("id", ParseIntPipe) id: number) {
    const admin = await this.requireAdmin(req);
    const runtimeId = BOT_ID_OFFSET + id;
    await this.botsService.removeBotByRuntimeId(runtimeId);
    const ok = await this.dbService.deleteBot(id);
    if (!ok) throw new NotFoundException();
    await this.audit(admin, "bot_delete", null, { botId: id });
    return { ok: true };
  }

  @Get("support/unread-count")
  async supportUnreadCount(@Req() req: Request) {
    await this.requireAdmin(req);
    const count = await this.dbService.countUnreadSupportMessages();
    return { count };
  }

  @Get("support")
  async supportMessages(
    @Req() req: Request,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("unreadOnly") unreadOnly?: string,
  ) {
    await this.requireAdmin(req);
    return this.dbService.listSupportMessagesAdmin(
      parseInt(page ?? "1", 10) || 1,
      parseInt(limit ?? "30", 10) || 30,
      unreadOnly === "1" || unreadOnly === "true",
    );
  }

  @Patch("support/:id/read")
  async markSupportRead(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
  ) {
    await this.requireAdmin(req);
    const ok = await this.dbService.markSupportMessageRead(id);
    if (!ok) throw new NotFoundException();
    return { ok: true };
  }

  @Patch("support/:id/reply")
  async replySupport(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { reply?: string },
  ) {
    const admin = await this.requireAdmin(req);
    const reply = (body.reply ?? "").trim();
    if (reply.length < 1 || reply.length > 2000) {
      throw new BadRequestException("Invalid reply");
    }
    const ok = await this.dbService.replySupportMessage(id, reply);
    if (!ok) throw new NotFoundException();
    await this.audit(admin, "support_reply", null, { supportId: id });
    return { ok: true };
  }

  @Get("logs")
  async adminLogs(
    @Req() req: Request,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    await this.requireAdmin(req);
    return this.dbService.getAdminLogs(
      parseInt(page ?? "1", 10) || 1,
      parseInt(limit ?? "50", 10) || 50,
    );
  }

  @Get("users")
  async listUsers(@Req() req: Request, @Query("q") q?: string) {
    await this.requireAdmin(req);
    const total = await this.dbService.countRegisteredUsers();
    const users = await this.dbService.listUsersForAdmin(q ?? "");
    const mapUser = (u: any) => ({
      id: u.id,
      nickname: u.nickname,
      coins: u.coins,
      lastSalaryAt: Number(u.lastSalaryAt ?? 0),
      salaryClaimCount: Number(u.salaryClaimCount ?? 0),
      role: u.role,
      banned: !!u.banned,
      badges: Array.isArray(u.badges) ? u.badges : [],
      characterType: u.characterType,
      streak_days: Number(u.streak_days ?? 0),
      starterQuestStep: Number(u.starterQuestStep ?? 0),
    });
    return { total, items: users.map(mapUser) };
  }

  @Get("users/:id")
  async getUser(@Req() req: Request, @Param("id", ParseIntPipe) id: number) {
    await this.requireAdmin(req);
    const detail = await this.dbService.getAdminUserDetail(id);
    if (!detail) throw new NotFoundException();
    const online = this.onlineUsersService.getById(id);
    return {
      ...detail,
      online: !!online,
      roomId: online?.roomId ?? null,
    };
  }

  @Get("users/:id/logs")
  async userLogs(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    await this.requireAdmin(req);
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    return this.dbService.getUserLogs(
      id,
      parseInt(page ?? "1", 10) || 1,
      parseInt(limit ?? "30", 10) || 30,
    );
  }

  @Post("users/:id/ban")
  async banUser(@Req() req: Request, @Param("id", ParseIntPipe) id: number) {
    const admin = await this.requireAdmin(req);
    if (id === admin.id) throw new BadRequestException("Cannot ban yourself");
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    await this.dbService.banUser(id);
    this.disconnectUser(id, "force:banned");
    await this.audit(
      admin,
      "ban",
      id,
      { nickname: user.nickname },
      { userId: id, message: `Забанен админом ${admin.nickname}` },
    );
    return { ok: true };
  }

  @Post("users/:id/unban")
  async unbanUser(@Req() req: Request, @Param("id", ParseIntPipe) id: number) {
    const admin = await this.requireAdmin(req);
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const ok = await this.dbService.unbanUser(id);
    if (!ok) throw new NotFoundException();
    await this.audit(
      admin,
      "unban",
      id,
      { nickname: user.nickname },
      { userId: id, message: `Разбанен админом ${admin.nickname}` },
    );
    return { ok: true };
  }

  @Post("users/:id/kick")
  async kickUser(@Req() req: Request, @Param("id", ParseIntPipe) id: number) {
    const admin = await this.requireAdmin(req);
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const online = this.onlineUsersService.getById(id);
    this.disconnectUser(id, "force:kicked");
    await this.audit(
      admin,
      "kick",
      id,
      { nickname: user.nickname, wasOnline: !!online },
      { userId: id, message: `Кикнут админом ${admin.nickname}` },
    );
    return { ok: true, wasOnline: !!online };
  }

  @Post("users/:id/coins")
  async grantCoins(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { amount?: number },
  ) {
    const admin = await this.requireAdmin(req);
    const amount = body.amount;
    if (!amount || amount <= 0) throw new BadRequestException("Invalid amount");
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const newCoins = await this.dbService.adminAddCoins(id, amount);
    if (newCoins == null) throw new NotFoundException();
    this.onlineUsersService.updateCoins(id, newCoins);
    await this.audit(
      admin,
      "grant_coins",
      id,
      { amount, coins: newCoins },
      { userId: id, message: `+${amount} монет (админ ${admin.nickname})` },
    );
    return { ok: true, coins: newCoins };
  }

  @Patch("users/:id/coins")
  async setCoins(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { coins?: number },
  ) {
    const admin = await this.requireAdmin(req);
    if (body.coins == null || body.coins < 0)
      throw new BadRequestException("Invalid coins");
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const newCoins = await this.dbService.adminSetCoins(id, body.coins);
    if (newCoins == null) throw new BadRequestException("Invalid coins");
    this.onlineUsersService.updateCoins(id, newCoins);
    await this.audit(
      admin,
      "set_coins",
      id,
      { coins: newCoins },
      { userId: id, message: `Монеты установлены: ${newCoins}` },
    );
    return { ok: true, coins: newCoins };
  }

  @Post("users/:id/badges")
  async grantBadge(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { badgeId?: string },
  ) {
    const admin = await this.requireAdmin(req);
    const badgeId = body.badgeId?.trim();
    if (!badgeId || !(BADGE_IDS as readonly string[]).includes(badgeId)) {
      throw new BadRequestException("Invalid badge");
    }
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const badges = await this.dbService.grantBadge(id, badgeId);
    if (!badges) throw new BadRequestException("Badge already owned");
    this.syncOnlineBadges(id, badges);
    await this.audit(
      admin,
      "grant_badge",
      id,
      { badgeId, badges },
      { userId: id, message: `Выдан бейдж: ${badgeId}` },
    );
    return { ok: true, badges };
  }

  @Delete("users/:id/badges/:badgeId")
  async revokeBadge(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Param("badgeId") badgeId: string,
  ) {
    const admin = await this.requireAdmin(req);
    if (!(BADGE_IDS as readonly string[]).includes(badgeId)) {
      throw new BadRequestException("Invalid badge");
    }
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const badges = await this.dbService.revokeBadge(id, badgeId);
    if (!badges) throw new BadRequestException("Badge not found");
    this.syncOnlineBadges(id, badges);
    await this.audit(
      admin,
      "revoke_badge",
      id,
      { badgeId, badges },
      { userId: id, message: `Снят бейдж: ${badgeId}` },
    );
    return { ok: true, badges };
  }

  @Post("users/:id/items")
  async grantItem(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { itemId?: string },
  ) {
    const admin = await this.requireAdmin(req);
    const itemId = body.itemId?.trim();
    if (!itemId) throw new BadRequestException("itemId required");
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const ownedItems = await this.dbService.adminGrantItem(id, itemId);
    if (!ownedItems) throw new BadRequestException("Invalid item or already owned");
    this.syncOnlineItems(id, ownedItems);
    await this.audit(
      admin,
      "grant_item",
      id,
      { itemId },
      { userId: id, message: `Выдана вещь: ${itemId}` },
    );
    return { ok: true, ownedItems };
  }

  @Delete("users/:id/items/:itemId")
  async removeItem(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Param("itemId") itemId: string,
  ) {
    const admin = await this.requireAdmin(req);
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const ownedItems = await this.dbService.adminRemoveItem(id, itemId);
    if (!ownedItems) throw new NotFoundException();
    this.syncOnlineItems(id, ownedItems);
    const online = this.onlineUsersService.getById(id);
    if (online) {
      const item = getShopItemById(itemId);
      if (item && online.equipped[item.category] === itemId) {
        online.equipped[item.category] = null;
        online.equippedColors[item.category] = null;
      }
      const sock = this.onlineUsersService.getSocketForUser(id);
      sock?.emit("user:equip", {
        socketId: online.socketId,
        equipped: online.equipped,
        equippedColors: online.equippedColors,
      });
    }
    await this.audit(
      admin,
      "remove_item",
      id,
      { itemId },
      { userId: id, message: `Снята вещь: ${itemId}` },
    );
    return { ok: true, ownedItems };
  }

  @Patch("users/:id/role")
  async setRole(
    @Req() req: Request,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { role?: string },
  ) {
    const admin = await this.requireAdmin(req);
    if (id === admin.id) throw new BadRequestException("Cannot change own role");
    const role = body.role?.trim();
    if (role !== "user" && role !== "admin") {
      throw new BadRequestException("Invalid role");
    }
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const ok = await this.dbService.adminSetRole(id, role);
    if (!ok) throw new BadRequestException("Invalid role");
    const online = this.onlineUsersService.getById(id);
    if (online) online.role = role;
    await this.audit(
      admin,
      "set_role",
      id,
      { role },
      { userId: id, message: `Роль изменена на: ${role}` },
    );
    return { ok: true, role };
  }

  @Post("users/:id/reset-salary")
  async resetSalary(@Req() req: Request, @Param("id", ParseIntPipe) id: number) {
    const admin = await this.requireAdmin(req);
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const ok = await this.dbService.adminResetSalary(id);
    if (!ok) throw new NotFoundException();

    const online = this.onlineUsersService.getById(id);
    if (online) {
      online.lastSalaryAt = 0;
      online.salaryClaimCount = 0;
      const sock = this.onlineUsersService.getSocketForUser(id);
      if (sock) {
        sock.emit("salary:wait", { remainMs: 0 });
        await this.notificationsService.syncUserNotifications(sock, {
          id: online.id,
          lastSalaryAt: 0,
          salaryClaimCount: 0,
        });
      }
    }

    await this.audit(
      admin,
      "reset_salary",
      id,
      {},
      { userId: id, message: "Сброшена зарплата" },
    );
    return { ok: true };
  }

  @Post("users/:id/reset-streak")
  async resetStreak(@Req() req: Request, @Param("id", ParseIntPipe) id: number) {
    const admin = await this.requireAdmin(req);
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const ok = await this.dbService.adminResetStreak(id);
    if (!ok) throw new NotFoundException();
    await this.audit(
      admin,
      "reset_streak",
      id,
      {},
      { userId: id, message: "Сброшен streak" },
    );
    return { ok: true };
  }

  @Post("users/:id/reset-quest")
  async resetQuest(@Req() req: Request, @Param("id", ParseIntPipe) id: number) {
    const admin = await this.requireAdmin(req);
    const user = await this.dbService.getUserById(id);
    if (!user) throw new NotFoundException();
    const ok = await this.dbService.adminResetStarterQuest(id);
    if (!ok) throw new NotFoundException();
    const online = this.onlineUsersService.getById(id);
    if (online) online.starterQuestStep = 0;
    await this.audit(
      admin,
      "reset_quest",
      id,
      {},
      { userId: id, message: "Сброшен стартовый квест" },
    );
    return { ok: true };
  }
}
