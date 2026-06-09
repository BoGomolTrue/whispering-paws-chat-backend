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
import { ProfilePost } from "./profile-post.model";
import { User } from "./user.model";

@Table({ tableName: "profile_post_comments", updatedAt: false })
export class ProfilePostComment extends Model<ProfilePostComment> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => ProfilePost)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  postId: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  userId: number;

  @AllowNull(false)
  @Column(DataType.TEXT)
  text: string;

  @BelongsTo(() => ProfilePost, { foreignKey: "postId", as: "post" })
  post: ProfilePost;

  @BelongsTo(() => User, { foreignKey: "userId", as: "author" })
  author: User;
}
