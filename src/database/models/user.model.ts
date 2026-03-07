import {
  AllowNull,
  AutoIncrement,
  Column,
  DataType,
  Default,
  HasMany,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from "sequelize-typescript";
import { Room } from "./room.model";
import { UserEquipped } from "./user-equipped.model";
import { UserItem } from "./user-item.model";

@Table({ tableName: "users", timestamps: true })
export class User extends Model<User> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING)
  email: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  password: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(20))
  nickname: string;

  @Default("cat")
  @AllowNull(false)
  @Column(DataType.STRING(10))
  characterType: string;

  @Default("male")
  @AllowNull(false)
  @Column(DataType.STRING(6))
  gender: string;

  @Default(100)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  coins: number;

  @Default("#ff0000")
  @AllowNull(false)
  @Column(DataType.STRING(10))
  eyeColor: string;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.BIGINT)
  lastSalaryAt: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  salaryClaimCount: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  totalSpent: number;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  notificationsOff: boolean;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  animationsOff: boolean;

  @Default("user")
  @AllowNull(false)
  @Column(DataType.STRING(10))
  role: string;

  @Default("")
  @AllowNull(false)
  @Column(DataType.STRING(50))
  status: string;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  banned: boolean;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  invisible: boolean;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.BIGINT)
  dmLastReadAt: number;

  @Default(null)
  @Column(DataType.INTEGER)
  lastRoomId: number | null;

  @Default(null)
  @Unique
  @Column(DataType.BIGINT)
  vkId: number | null;

  @Default(null)
  @Column(DataType.STRING)
  telegramId: string | null;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isGuest: boolean;

  @Default(null)
  @Column(DataType.STRING(10))
  streak_last_date: string | null;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  streak_days: number;

  @Default(null)
  @Column(DataType.TEXT)
  anketa_about: string | null;

  @Default(null)
  @Column(DataType.STRING(80))
  anketa_city: string | null;

  @Default(null)
  @Column(DataType.STRING(200))
  anketa_interests: string | null;

  @Default(null)
  @Column(DataType.STRING(30))
  anketa_looking_for: string | null;

  @Default(null)
  @Column(DataType.STRING(10))
  anketa_age: string | null;

  @Default(null)
  @Column(DataType.STRING(500))
  anketa_avatar: string | null;

  @HasMany(() => UserItem)
  items: UserItem[];

  @HasMany(() => UserEquipped)
  equipped: UserEquipped[];

  @HasMany(() => Room, { foreignKey: "creatorId" })
  createdRooms: Room[];
}
