import mongoose, { Schema, models, model } from "mongoose";

const VipDonationSchema = new Schema(
  {
    txId: { type: String, required: true, unique: true, lowercase: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    coin: { type: String, default: "USDC" },
    network: { type: String, required: true },
    verifiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export type VipDonationDoc = mongoose.InferSchemaType<typeof VipDonationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const VipDonation =
  (models.VipDonation as mongoose.Model<VipDonationDoc>) ||
  model<VipDonationDoc>("VipDonation", VipDonationSchema);
