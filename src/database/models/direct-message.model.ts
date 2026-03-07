import {
  AllowNull,
  AutoIncrement,
  Column,
  DataType,
  ForeignKey,
  Index,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";
import { User } from "./user.model";

@Table({ tableName: "direct_messages", timestamps: false })
export class DirectMessage extends Model<DirectMessage> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => User)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  fromUserId: number;

  @ForeignKey(() => User)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  toUserId: number;

  @AllowNull(false)
  @Column(DataType.STRING(500))
  text: string;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  timestamp: number;
}
