import {
  AllowNull,
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "settings", timestamps: false })
export class Setting extends Model<Setting> {
  @PrimaryKey
  @Column({ type: DataType.STRING(50) })
  key: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(500) })
  value: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  label: string;

  @Default("number")
  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  type: string;
}
