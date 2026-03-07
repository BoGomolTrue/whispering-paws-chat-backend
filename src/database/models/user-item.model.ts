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
  tableName: "user_items",
  timestamps: false,
  indexes: [{ unique: true, fields: ["userId", "itemId"] }],
})
export class UserItem extends Model<UserItem> {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId: number;

  @Column({ type: DataType.STRING, allowNull: false })
  itemId: string;

  @BelongsTo(() => User)
  user: User;
}
