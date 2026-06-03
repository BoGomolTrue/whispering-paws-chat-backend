import {
  AllowNull,
  AutoIncrement,
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

@Table({ tableName: "notifications", timestamps: true })
export class Notification extends Model<Notification> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  userId: number;

  @AllowNull(false)
  @Column(DataType.STRING(32))
  type: string;

  @Default({})
  @AllowNull(false)
  @Column(DataType.JSONB)
  payload: Record<string, unknown>;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  read: boolean;

  @BelongsTo(() => User)
  user: User;
}
