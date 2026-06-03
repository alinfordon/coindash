import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Analysis } from "@/models/Analysis";
import { toObjectId } from "@/lib/tenant";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const userId = await getApiUserId();
    const uid = toObjectId(userId);
    const docs = await Analysis.aggregate([
      { $match: { userId: uid } },
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
  } catch (e) {
    return apiError(e);
  }
}
