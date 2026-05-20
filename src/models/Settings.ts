import mongoose, { Schema, models, model } from "mongoose";

const SettingsSchema = new Schema(
  {
    aiProvider: { type: String, enum: ["claude", "gemini", "ollama"], default: "claude" },
    aiModel: { type: String, default: "claude-sonnet-4-5" },
    /** Empty = use aiModel. Used only by analysis cron (market scan). */
    analysisAiModel: { type: String, default: "" },
    aiApiKey: { type: String, default: "" },
    ollamaUrl: { type: String, default: "http://localhost:11434" },
    binanceApiKey: { type: String, default: "" },
    binanceApiSecret: { type: String, default: "" },
    binanceTestnet: { type: Boolean, default: true },
    pilotActive: { type: Boolean, default: false },
    positionCheckCronActive: { type: Boolean, default: true },
    analysisCronActive: { type: Boolean, default: true },
    dryRun: { type: Boolean, default: true },
    maxOpenPairs: { type: Number, default: 5, min: 1, max: 20 },
    maxUsdcPerOrder: { type: Number, default: 50, min: 10, max: 1000 },
    minConfidence: { type: Number, default: 75, min: 0, max: 100 },
    /** Balanced entry gate: local TA checks before opening. */
    entryGateEnabled: { type: Boolean, default: true },
    minTechnicalScore: { type: Number, default: 40, min: -100, max: 100 },
    requireStrongBuyOnly: { type: Boolean, default: false },
    maxPump24hPct: { type: Number, default: 15, min: 5, max: 50 },
    slCooldownMinutes: { type: Number, default: 120, min: 0, max: 1440 },
    tpReopenCooldownMinutes: { type: Number, default: 30, min: 0, max: 480 },
    defaultReopenCooldownMinutes: { type: Number, default: 30, min: 0, max: 480 },
    stopLossPercent: { type: Number, default: 2 },
    takeProfitPercent: { type: Number, default: 4 },
    riskRewardRatio: { type: Number, default: 2.0 },
    telegramBotToken: { type: String, default: "" },
    telegramChatId: { type: String, default: "" },
    // IANA timezone used to anchor "today" windows (e.g. Today P&L card).
    displayTimezone: { type: String, default: "Europe/Bucharest" },
    /** Base tickers (e.g. BTC) or full symbols (BTCUSDC) excluded from automated trading. */
    pairBlacklist: { type: [String], default: [] },
    // Snapshot of Binance USDC cash (free+locked). Refreshed after open/close
    // and on-demand, so the dashboard never has to call /account live.
    cashBalanceUsdc: { type: Number, default: 0 },
    cashBalanceUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type SettingsDoc = mongoose.InferSchemaType<typeof SettingsSchema> & { _id: any };
export const Settings = (models.Settings as mongoose.Model<SettingsDoc>) || model<SettingsDoc>("Settings", SettingsSchema);
