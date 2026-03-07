import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from "sequelize-typescript";
import { User } from "./user.model";

@Table({
  tableName: "user_equipped",
  timestamps: false,
  indexes: [{ unique: true, fields: ["userId", "category"] }],
})
export class UserEquipped extends Model<UserEquipped> {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId: number;

  @Column({ type: DataType.STRING(20), allowNull: false })
  category: string;

  @Column({ type: DataType.STRING, allowNull: false })
  itemId: string;

  @Column({ type: DataType.STRING(20), allowNull: true, defaultValue: null })
  color: string | null;

  @BelongsTo(() => User)
  user: User;
}
