import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/nexustrade";
await mongoose.connect(uri);
const col = mongoose.connection.collection("settings");

const dupGroups = await col
  .aggregate([
    { $match: { userId: { $exists: true, $ne: null } } },
    { $sort: { updatedAt: -1 } },
    {
      $group: {
        _id: "$userId",
        keep: { $first: "$_id" },
        drop: { $push: "$_id" },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ])
  .toArray();

let removed = 0;
for (const g of dupGroups) {
  const dropIds = g.drop.filter((id) => String(id) !== String(g.keep));
  if (dropIds.length) {
    const r = await col.deleteMany({ _id: { $in: dropIds } });
    removed += r.deletedCount || 0;
  }
}

try {
  await col.createIndex({ userId: 1 }, { unique: true, background: true });
  console.log("unique index on userId ensured");
} catch (e) {
  console.warn("index:", e.message);
}

const total = await col.countDocuments();
console.log(`removed ${removed} duplicates, total docs now ${total}`);
await mongoose.disconnect();
