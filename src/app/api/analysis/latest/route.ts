import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Analysis } from "@/models/Analysis";

export const dynamic = "force-dynamic";

export async function GET() {
  await connectDB();
  // Latest analysis per pair
  const docs = await Analysis.aggregate([
    { $sort: { analyzedAt: -1 } },
    {
      $group: {
        _id: "$pair",
        doc: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$doc" } },
    { $sort: { confidence: -1, analyzedAt: -1 } },
    { $limit: 100 },
  ]);
  return NextResponse.json({ analyses: docs });
}
