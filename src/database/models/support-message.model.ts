import {
  AllowNull,
  AutoIncrement,
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "support_messages", updatedAt: false })
export class SupportMessage extends Model<SupportMessage> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  userId: number;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  nickname: string;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  category: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  message: string;

  @Default(null)
  @Column(DataType.STRING(255))
  imageUrl: string | null;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  read: boolean;

  @Default(null)
  @Column(DataType.TEXT)
  adminReply: string | null;

  @Default(null)
  @Column(DataType.DATE)
  adminRepliedAt: Date | null;
}
