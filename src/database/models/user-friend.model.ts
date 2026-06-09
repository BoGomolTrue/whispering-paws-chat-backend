import {
  AllowNull,
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";
import { User } from "./user.model";

@Table({ tableName: "user_friends", updatedAt: false })
export class UserFriend extends Model<UserFriend> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  userId: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  friendId: number;

  @BelongsTo(() => User, { foreignKey: "userId", as: "user" })
  user: User;

  @BelongsTo(() => User, { foreignKey: "friendId", as: "friend" })
  friend: User;
}
