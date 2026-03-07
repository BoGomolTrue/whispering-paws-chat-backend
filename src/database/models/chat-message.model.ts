import {
  AllowNull,
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Index,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";
import { Room } from "./room.model";
import { User } from "./user.model";

@Table({ tableName: "chat_messages", timestamps: false })
export class ChatMessage extends Model<ChatMessage> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Room)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  roomId: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  userId: number | null;

  @Default("")
  @AllowNull(false)
  @Column(DataType.STRING(20))
  nickname: string;

  @AllowNull(false)
  @Column(DataType.STRING(500))
  text: string;

  @Default(null)
  @Column(DataType.STRING(6))
  gender: string | null;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isSystem: boolean;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  timestamp: number;

  @BelongsTo(() => Room)
  room: Room;

  @BelongsTo(() => User)
  user: User;
}
