import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import mongoose, { Document } from "mongoose";

export type UserDocument = User & Document;

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop()
  _id: mongoose.Schema.Types.ObjectId;

  @Prop()
  name: string;

  @Prop({ unique: true })
  email: string;

  @Prop()
  password: string;

  @Prop()
  refreshToken: string;

  @Prop({ default: "user", type: String, enum: ["user", "admin"] })
  role: string;
}

export const UserSchema = SchemaFactory.createForClass(User);