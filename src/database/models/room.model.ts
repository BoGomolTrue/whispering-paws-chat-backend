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

  @ForeignKey(() => User)
  @BelongsTo(() => User, { foreignKey: "creatorId", as: "creator" })
  creator: User;

  @HasMany(() => ChatMessage)
  messages: ChatMessage[];
}
