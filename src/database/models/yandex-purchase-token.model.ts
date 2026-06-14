import {
  AllowNull,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

@Table({ tableName: "yandex_purchase_tokens", updatedAt: false })
export class YandexPurchaseToken extends Model<YandexPurchaseToken> {
  @PrimaryKey
  @AllowNull(false)
  @Column(DataType.STRING(128))
  token: string;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  userId: number;

  @AllowNull(false)
  @Column(DataType.STRING(64))
  productId: string;

  @Column(DataType.DATE)
  createdAt: Date;
}
