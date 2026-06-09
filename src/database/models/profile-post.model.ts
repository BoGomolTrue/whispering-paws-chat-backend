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

@Table({ tableName: "profile_posts", updatedAt: false })
export class ProfilePost extends Model<ProfilePost> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  userId: number;

  @AllowNull(false)
  @Column(DataType.TEXT)
  text: string;

  @Column(DataType.STRING(255))
  imageUrl: string | null;

  @BelongsTo(() => User, { foreignKey: "userId", as: "author" })
  author: User;
}
