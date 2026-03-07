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

@Table({ tableName: "ranks", timestamps: false })
export class Rank extends Model<Rank> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Unique
  @Column(DataType.INTEGER)
  min: number;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  name: string;
}
