import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/nexustrade";
await mongoose.connect(uri);
const col = mongoose.connection.collection("settings");
const total = await col.countDocuments();
const dups = await col
  .aggregate([{ $group: { _id: "$userId", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])
  .toArray();
console.log("total", total, "duplicate userIds", dups.length);
await mongoose.disconnect();
