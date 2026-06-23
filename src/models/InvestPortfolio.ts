import mongoose, { Schema, models, model } from "mongoose";

const TargetSchema = new Schema(
  {
    asset: { type: String, required: true, trim: true, uppercase: true },
    weightPct: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const InvestPortfolioSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    name: { type: String, default: "Portofoliu long-term", trim: true },
    /** Drift % per asset before local rebalance suggestions fire. */
    rebalanceThresholdPct: { type: Number, default: 5, min: 1, max: 25 },
    /** Core allocation targets (weights normalized to 100 on save). */
    targets: { type: [TargetSchema], default: [] },
    lastAiAdviceAt: { type: Date, default: null },
    lastAiAdvice: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

export type InvestTarget = { asset: string; weightPct: number };

export type InvestPortfolioDoc = mongoose.InferSchemaType<typeof InvestPortfolioSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const InvestPortfolio =
  (models.InvestPortfolio as mongoose.Model<InvestPortfolioDoc>) ||
  model<InvestPortfolioDoc>("InvestPortfolio", InvestPortfolioSchema);
