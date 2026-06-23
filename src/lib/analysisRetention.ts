import { Analysis } from "@/models/Analysis";
import { toObjectId } from "@/lib/tenant";
import { ANALYSIS_RETENTION_LIMIT } from "@/lib/analysisConstants";

export { ANALYSIS_RETENTION_LIMIT } from "@/lib/analysisConstants";

/** Delete analysis documents beyond the newest N for one user. */
export async function purgeStaleAnalyses(userId: string): Promise<number> {
  const uid = toObjectId(userId);
  const keep = await Analysis.find({ userId: uid })
    .sort({ analyzedAt: -1 })
    .limit(ANALYSIS_RETENTION_LIMIT)
    .select("_id")
    .lean();

  if (keep.length === 0) return 0;

  const keepIds = keep.map((d) => d._id);
  const res = await Analysis.deleteMany({ userId: uid, _id: { $nin: keepIds } });
  return res.deletedCount ?? 0;
}
