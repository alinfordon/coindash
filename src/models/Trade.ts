import mongoose, { Schema, models, model } from "mongoose";

const TradeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pair: { type: String, required: true, index: true },
    side: { type: String, enum: ["BUY", "SELL"], default: "BUY" },
    status: { type: String, enum: ["OPEN", "CLOSED", "CANCELLED"], default: "OPEN", index: true },
    entryPrice: Number,
    exitPrice: Number,
    quantity: Number,
    usdcValue: Number,
    stopLoss: Number,
    takeProfit: Number,
    binanceOrderId: String,
    ocoOrderId: String,
    openedAt: { type: Date, default: Date.now },
    closedAt: Date,
    closedReason: { type: String, enum: ["TP_HIT", "SL_HIT", "AI_DECISION", "MANUAL", "RECONCILED", null], default: null },
    pnlUsdc: Number,
    pnlPercent: Number,
    aiProvider: String,
    aiModel: String,
    aiConfidence: Number,
    aiReasoning: String,
    technicalIndicators: { type: Schema.Types.Mixed },
    dryRun: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TradeSchema.index({ userId: 1, status: 1, openedAt: -1 });
TradeSchema.index({ userId: 1, closedAt: -1 });
TradeSchema.index({ userId: 1, pair: 1, status: 1 });

export type TradeDoc = mongoose.InferSchemaType<typeof TradeSchema> & { _id: any };
export const Trade = (models.Trade as mongoose.Model<TradeDoc>) || model<TradeDoc>("Trade", TradeSchema);
