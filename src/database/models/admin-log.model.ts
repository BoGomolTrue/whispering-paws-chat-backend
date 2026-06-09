import {
  AllowNull,
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "admin_logs", updatedAt: false })
export class AdminLog extends Model<AdminLog> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  adminId: number;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  adminNickname: string;

  @AllowNull(false)
  @Column(DataType.STRING(40))
  action: string;

  @Column(DataType.INTEGER)
  targetUserId: number | null;

  @AllowNull(false)
  @Column(DataType.JSON)
  details: Record<string, unknown>;

  @Column(DataType.DATE)
  createdAt: Date;
}
