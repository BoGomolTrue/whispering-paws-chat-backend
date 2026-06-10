import {
  AllowNull,
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "promo_code_redemptions", updatedAt: false })
export class PromoCodeRedemption extends Model<PromoCodeRedemption> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  promoCodeId: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  userId: number;

  @Column(DataType.DATE)
  createdAt: Date;
}
