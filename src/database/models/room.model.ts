import {
  AllowNull,
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  HasMany,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from "sequelize-typescript";
import { ChatMessage } from "./chat-message.model";
import { User } from "./user.model";

@Table({ tableName: "rooms", timestamps: true })
export class Room extends Model<Room> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(50))
  name: string;

  @Default(null)
  @Column(DataType.INTEGER)
  creatorId: number | null;

  @Default(20)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  maxUsers: number;

  @Default("grass")
  @AllowNull(false)
  @Column(DataType.STRING(20))
  backgroundType: string;

  @Default("clear")
  @AllowNull(false)
  @Column(DataType.STRING(20))
  weather: string;

  @Default(null)
  @AllowNull(true)
  @Column(DataType.STRING(255))
  photoUrl: string | null;

  @Default(null)
  @AllowNull(true)
  @Column(DataType.TEXT)
  description: string | null;

  @Default(null)
  @AllowNull(true)
  @Column(DataType.STRING(255))
  passwordHash: string | null;

  @ForeignKey(() => User)
  @BelongsTo(() => User, { foreignKey: "creatorId", as: "creator" })
  creator: User;

  @HasMany(() => ChatMessage)
  messages: ChatMessage[];
}
