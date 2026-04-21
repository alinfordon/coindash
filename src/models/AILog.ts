import mongoose, { Schema, models, model } from "mongoose";

const AILogSchema = new Schema(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    action: {
      type: String,
      enum: ["ANALYSIS", "BUY_SIGNAL", "SELL_SIGNAL", "HOLD", "POSITION_CHECK", "CRON_START", "CRON_END", "ERROR"],
      default: "ANALYSIS",
    },
    pair: String,
    decision: String,
    confidence: Number,
    reasoning: String,
    executedTrade: { type: Boolean, default: false },
    tradeId: { type: Schema.Types.ObjectId, ref: "Trade" },
    aiProvider: String,
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AILogSchema.index({ timestamp: -1 });

export type AILogDoc = mongoose.InferSchemaType<typeof AILogSchema> & { _id: any };
export const AILog = (models.AILog as mongoose.Model<AILogDoc>) || model<AILogDoc>("AILog", AILogSchema);
