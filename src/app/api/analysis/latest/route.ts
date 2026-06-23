import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Analysis } from "@/models/Analysis";
import { toObjectId } from "@/lib/tenant";
import { getApiUserId, apiError } from "@/lib/apiUser";
import { localizeAnalysisDisplay } from "@/lib/analysisLocale";
import { ANALYSIS_RETENTION_LIMIT, purgeStaleAnalyses } from "@/lib/analysisRetention";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const userId = await getApiUserId();
    const uid = toObjectId(userId);
    await purgeStaleAnalyses(userId);
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
      { $limit: ANALYSIS_RETENTION_LIMIT },
    ]);
    const analyses = docs.map((doc) => {
      const localized = localizeAnalysisDisplay(
        doc.reasoning ?? "",
        doc.pair ?? "",
        doc.keyFactors ?? []
      );
      return { ...doc, reasoning: localized.reasoning, keyFactors: localized.keyFactors };
    });
    return NextResponse.json({ analyses });
  } catch (e) {
    return apiError(e);
  }
}
