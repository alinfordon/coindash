import mongoose from "mongoose";

await mongoose.connect(process.env.MONGODB_URI);
const col = mongoose.connection.collection("analyses");
const total = await col.countDocuments();
const noUser = await col.countDocuments({ $or: [{ userId: { $exists: false } }, { userId: null }] });
const sample = await col.find({}).sort({ analyzedAt: -1 }).limit(3).project({
  pair: 1,
  userId: 1,
  analyzedAt: 1,
  price: 1,
  recommendation: 1,
  confidence: 1,
  "indicators.rsi": 1,
  "indicators.priceChange24h": 1,
  interval: 1,
  aiProvider: 1,
}).toArray();
console.log({ total, noUser, sample });
await mongoose.disconnect();
