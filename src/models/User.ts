import mongoose, { Schema, models, model } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, default: "" },
    role: { type: String, enum: ["admin", "user", "vip"], default: "user" },
    status: { type: String, enum: ["active", "pending", "disabled"], default: "pending" },
    inviteToken: { type: String, default: null, index: true, sparse: true },
    inviteExpiresAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type UserDoc = mongoose.InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };
export const User =
  (models.User as mongoose.Model<UserDoc>) || model<UserDoc>("User", UserSchema);
