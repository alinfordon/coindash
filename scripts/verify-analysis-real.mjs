import mongoose from "mongoose";

function ema(values, period) {
  const out = new Array(values.length).fill(NaN);
  if (!values.length) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsi(values, period = 14) {
  const out = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function macd(values) {
  const emaFast = ema(values, 12);
  const emaSlow = ema(values, 26);
  const macdLine = values.map((_, i) =>
    Number.isNaN(emaFast[i]) || Number.isNaN(emaSlow[i]) ? NaN : emaFast[i] - emaSlow[i]
  );
  const macdValid = macdLine.map((v) => (Number.isNaN(v) ? 0 : v));
  const signalLine = ema(macdValid, 9).map((v, i) => (Number.isNaN(macdLine[i]) ? NaN : v));
  const hist = macdLine.map((v, i) => (Number.isNaN(v) || Number.isNaN(signalLine[i]) ? NaN : v - signalLine[i]));
  return { hist };
}

await mongoose.connect(process.env.MONGODB_URI);
const analyses = mongoose.connection.collection("analyses");
const settingsCol = mongoose.connection.collection("settings");

const total = await analyses.countDocuments();
const noUser = await analyses.countDocuments({ $or: [{ userId: { $exists: false } }, { userId: null }] });

const doc = await analyses.find({}).sort({ analyzedAt: -1 }).limit(1).next();
const uid = doc.userId;
const settings = await settingsCol.findOne({ userId: uid });
const testnet = settings?.binanceTestnet ?? true;
const api = testnet ? "https://testnet.binance.vision" : "https://api.binance.com";
const interval = doc.interval || "1h";
const sym = doc.pair;

const r = await fetch(`${api}/api/v3/klines?symbol=${sym}&interval=${interval}&limit=100`);
const klines = await r.json();
if (!Array.isArray(klines)) {
  console.log("binance error", klines);
  process.exit(1);
}

const closes = klines.map((c) => +c[4]);
const rsiNow = rsi(closes)[closes.length - 1];
const histNow = macd(closes).hist[closes.length - 1];
const livePrice = closes[closes.length - 1];
const stored = doc.indicators || {};

const perUser = await analyses
  .aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 }, latest: { $max: "$analyzedAt" } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ])
  .toArray();

const uniquePairs = await analyses
  .aggregate([
    { $match: { userId: uid } },
    { $group: { _id: "$pair" } },
    { $count: "pairs" },
  ])
  .toArray();

console.log(
  JSON.stringify(
    {
      db: { total, noUser, pairsForLatestUser: uniquePairs[0]?.pairs ?? 0 },
      perUser: perUser.map((u) => ({
        userId: String(u._id),
        count: u.count,
        latest: u.latest,
      })),
      sampleVerification: {
        pair: sym,
        testnet,
        analyzedAt: doc.analyzedAt,
        minutesSinceScan: Math.round((Date.now() - new Date(doc.analyzedAt).getTime()) / 60000),
        storedPrice: doc.price,
        liveClose: livePrice,
        storedRsi: stored.rsi,
        liveRsi: rsiNow,
        rsiDelta: Math.abs((stored.rsi ?? 0) - rsiNow),
        storedMacdHist: stored.macd?.histogram,
        liveMacdHist: histNow,
        macdDelta: Math.abs((stored.macd?.histogram ?? 0) - histNow),
        recommendation: doc.recommendation,
        confidence: doc.confidence,
        aiProvider: doc.aiProvider,
        aiModel: doc.aiModel,
        reasoningLen: (doc.reasoning || "").length,
      },
    },
    null,
    2
  )
);

await mongoose.disconnect();
