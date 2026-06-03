import mongoose, { Schema, models, model } from "mongoose";

const AnalysisSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pair: { type: String, required: true, index: true },
    analyzedAt: { type: Date, default: Date.now, index: true },
    interval: { type: String, default: "1h" },
    entryInterval: { type: String, default: "15m" },
    technicalScore: Number,
    fundamentalScore: Number,
    combinedScore: Number,
    recommendation: {
      type: String,
      enum: ["STRONG_BUY", "BUY", "HOLD", "SELL", "STRONG_SELL"],
      default: "HOLD",
    },
    confidence: Number,
    reasoning: String,
    riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "MEDIUM" },
    keyFactors: [String],
    price: Number,
    indicators: {
      rsi: Number,
      macd: {
        value: Number,
        signal: Number,
        histogram: Number,
      },
      bb: {
        upper: Number,
        middle: Number,
        lower: Number,
      },
      ema20: Number,
      ema50: Number,
      volume24h: Number,
      priceChange24h: Number,
      high24h: Number,
      low24h: Number,
    },
    aiProvider: String,
    aiModel: String,
    rawResponse: String,
  },
  { timestamps: true }
);

AnalysisSchema.index({ userId: 1, pair: 1, analyzedAt: -1 });

export type AnalysisDoc = mongoose.InferSchemaType<typeof AnalysisSchema> & { _id: any };
export const Analysis = (models.Analysis as mongoose.Model<AnalysisDoc>) || model<AnalysisDoc>("Analysis", AnalysisSchema);
