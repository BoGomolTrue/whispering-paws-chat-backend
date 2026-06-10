import {
  AllowNull,
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from "sequelize-typescript";

@Table({ tableName: "promo_codes", updatedAt: false })
export class PromoCode extends Model<PromoCode> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(32))
  code: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  coins: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  createdByAdminId: number;

  @Column(DataType.DATE)
  createdAt: Date;

  @Column(DataType.DATE)
  expiresAt: Date | null;
}
