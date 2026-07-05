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
    /** Entry commission (exchange-reported). */
    entryFee: Number,
    feeCurrency: String,
    /** Total fees (entry + exit); used by analytics. */
    fee: Number,
    stopLoss: Number,
    takeProfit: Number,
    binanceOrderId: String,
    ocoOrderId: String,
    /** Kraken dual exit orders (TP limit + SL stop) when no native OCO. */
    exitOrderIds: { type: [String], default: [] },
    /** Exchange used when opening this trade. */
    exchange: { type: String, enum: ["binance", "kraken"], default: "binance" },
    /** Kraken xStocks vs crypto spot. */
    assetClass: { type: String, enum: ["crypto", "tokenized_asset"], default: "crypto" },
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
