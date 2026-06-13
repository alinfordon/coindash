import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Analysis } from "@/models/Analysis";
import { AILog } from "@/models/AILog";
import { getSettings } from "@/lib/settings";
import { toObjectId } from "@/lib/tenant";
import { getApiUserId, apiError } from "@/lib/apiUser";
import {
  ANALYSIS_CRON_INTERVAL_MS,
  computeAnalysisSchedule,
} from "@/lib/analysisSchedule";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const userId = await getApiUserId();
    const uid = toObjectId(userId);
    const settings = await getSettings(userId);

    const [lastLog, lastDoc] = await Promise.all([
      AILog.findOne({
        userId: uid,
        action: "CRON_END",
        "meta.analyzed": { $exists: true },
      })
        .sort({ createdAt: -1 })
        .select("createdAt meta")
        .lean(),
      Analysis.findOne({ userId: uid }).sort({ analyzedAt: -1 }).select("analyzedAt").lean(),
    ]);

    const logMs = lastLog?.createdAt ? new Date(lastLog.createdAt as Date).getTime() : 0;
    const docMs = lastDoc?.analyzedAt ? new Date(lastDoc.analyzedAt as Date).getTime() : 0;
    const lastMs = Math.max(logMs, docMs);
    const lastAnalysisAt = lastMs > 0 ? new Date(lastMs).toISOString() : null;

    const schedule = computeAnalysisSchedule(lastAnalysisAt);
    const cronEnabled = settings.pilotActive && settings.analysisCronActive;

    return NextResponse.json({
      lastAnalysisAt,
      nextRunAt: schedule.nextRunAt.toISOString(),
      secsUntil: schedule.secsUntil,
      overdue: schedule.overdue,
      intervalMinutes: ANALYSIS_CRON_INTERVAL_MS / 60_000,
      cronEnabled,
      pilotActive: settings.pilotActive,
      analysisCronActive: settings.analysisCronActive,
    });
  } catch (e) {
    return apiError(e);
  }
}
