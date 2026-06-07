import mongoose from "mongoose";

await mongoose.connect(process.env.MONGODB_URI);
const col = mongoose.connection.collection("trades");
const sample = await col.findOne({ status: "CLOSED" });
if (!sample) {
  console.log("no closed trades");
  process.exit(0);
}
const idStr = String(sample.userId);
const idObj = sample.userId;
const asStr = await col.countDocuments({ userId: idStr, status: "CLOSED" });
const asObj = await col.countDocuments({ userId: idObj, status: "CLOSED" });
const aggStr = await col.aggregate([{ $match: { userId: idStr, status: "CLOSED" } }, { $count: "n" }]).toArray();
const aggObj = await col.aggregate([{ $match: { userId: idObj, status: "CLOSED" } }, { $count: "n" }]).toArray();
console.log({ asStr, asObj, aggStr, aggObj });
await mongoose.disconnect();
