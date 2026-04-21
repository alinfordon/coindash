import mongoose, { Schema, models, model } from "mongoose";

const TradeSchema = new Schema(
  {
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
    closedReason: { type: String, enum: ["TP_HIT", "SL_HIT", "AI_DECISION", "MANUAL", null], default: null },
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

TradeSchema.index({ status: 1, openedAt: -1 });
TradeSchema.index({ closedAt: -1 });

export type TradeDoc = mongoose.InferSchemaType<typeof TradeSchema> & { _id: any };
export const Trade = (models.Trade as mongoose.Model<TradeDoc>) || model<TradeDoc>("Trade", TradeSchema);
