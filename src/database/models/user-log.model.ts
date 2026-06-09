import {
  AllowNull,
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "user_logs", updatedAt: false })
export class UserLog extends Model<UserLog> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  userId: number;

  @AllowNull(false)
  @Column(DataType.STRING(40))
  type: string;

  @AllowNull(false)
  @Column(DataType.STRING(500))
  message: string;

  @AllowNull(false)
  @Column(DataType.JSON)
  meta: Record<string, unknown>;

  @Column(DataType.DATE)
  createdAt: Date;
}
