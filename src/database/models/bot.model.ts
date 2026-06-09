import {
  AllowNull,
  AutoIncrement,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from "sequelize-typescript";
import { Room } from "./room.model";

@Table({ tableName: "bots", timestamps: true })
export class Bot extends Model<Bot> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  nickname: string;

  @ForeignKey(() => Room)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  roomId: number;

  @Default("cat")
  @AllowNull(false)
  @Column(DataType.STRING(10))
  characterType: string;

  @Default("female")
  @AllowNull(false)
  @Column(DataType.STRING(6))
  gender: string;

  @Default("#8E44AD")
  @AllowNull(false)
  @Column(DataType.STRING(10))
  eyeColor: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(24))
  socketId: string;

  @Default("")
  @AllowNull(false)
  @Column(DataType.STRING(50))
  status: string;

  @Default(100)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  coins: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  inventoryValue: number;

  @Default([])
  @AllowNull(false)
  @Column(DataType.JSON)
  badges: string[];

  @Default([])
  @AllowNull(false)
  @Column(DataType.JSON)
  ownedItems: string[];

  @Default({})
  @AllowNull(false)
  @Column(DataType.JSON)
  equipped: Record<string, { itemId: string; color: string | null } | undefined>;

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
  @Column(DataType.STRING(10))
  anketa_age: string | null;

  @Default(null)
  @Column(DataType.STRING(30))
  anketa_looking_for: string | null;

  @Default(["", "тут", "скучно", "brb"])
  @AllowNull(false)
  @Column(DataType.JSON)
  statusPool: string[];

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  hidden: boolean;
}
