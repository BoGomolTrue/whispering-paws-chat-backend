import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";
import { User } from "./user.model";

@Table({ tableName: "user_daily", timestamps: false })
export class UserDaily extends Model<UserDaily> {
  @PrimaryKey
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId: number;

  @PrimaryKey
  @Column({ type: DataType.STRING(10), allowNull: false })
  day: string;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  messagesSent: number;

  @Default("")
  @AllowNull(false)
  @Column(DataType.TEXT)
  roomsVisited: string;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  boughtCount: number;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  rewardMessagesClaimed: boolean;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  rewardRoomsClaimed: boolean;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  rewardBuyClaimed: boolean;

  @BelongsTo(() => User)
  user: User;
}
