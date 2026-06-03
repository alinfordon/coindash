import mongoose from "mongoose";
import { connectDB } from "./db";
import { Settings } from "@/models/Settings";
import { Trade } from "@/models/Trade";
import { Analysis } from "@/models/Analysis";
import { AILog } from "@/models/AILog";
import { User } from "@/models/User";
import { ensureBootstrapAdmin } from "./users";

const g = global as typeof globalThis & { __NEXUS_TENANT_MIGRATED__?: boolean };

/** Assign legacy global rows to the first admin user (once per process). */
export async function migrateLegacyTenantData(): Promise<void> {
  if (g.__NEXUS_TENANT_MIGRATED__) return;
  await connectDB();
  await ensureBootstrapAdmin();

  const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
  if (!admin) return;

  const userId = admin._id;
  const legacyFilter = {
    $or: [{ userId: { $exists: false } }, { userId: null }],
  };

  const [settingsN, tradesN, analysisN, logsN] = await Promise.all([
    Settings.countDocuments(legacyFilter),
    Trade.countDocuments(legacyFilter),
    Analysis.countDocuments(legacyFilter),
    AILog.countDocuments(legacyFilter),
  ]);

  if (settingsN + tradesN + analysisN + logsN === 0) {
    g.__NEXUS_TENANT_MIGRATED__ = true;
    return;
  }

  await Promise.all([
    Settings.updateMany(legacyFilter, { $set: { userId } }),
    Trade.updateMany(legacyFilter, { $set: { userId } }),
    Analysis.updateMany(legacyFilter, { $set: { userId } }),
    AILog.updateMany(legacyFilter, { $set: { userId } }),
  ]);

  console.log(
    `[tenant] migrated legacy data → admin ${admin.email}: settings=${settingsN} trades=${tradesN} analysis=${analysisN} logs=${logsN}`
  );
  g.__NEXUS_TENANT_MIGRATED__ = true;
}

export function toObjectId(userId: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(userId);
}

export function userScope(userId: string, extra: Record<string, unknown> = {}) {
  return { userId: toObjectId(userId), ...extra };
}

/** Users eligible for scheduled analysis cron. */
export async function listAnalysisCronUserIds(): Promise<string[]> {
  await connectDB();
  await migrateLegacyTenantData();
  const rows = await Settings.find({
    pilotActive: true,
    analysisCronActive: true,
  })
    .select("userId")
    .lean();
  return rows.map((r) => String((r as any).userId)).filter(Boolean);
}

/** Users eligible for scheduled position cron. */
export async function listPositionCronUserIds(): Promise<string[]> {
  await connectDB();
  await migrateLegacyTenantData();
  const rows = await Settings.find({
    pilotActive: true,
    positionCheckCronActive: true,
  })
    .select("userId")
    .lean();
  return rows.map((r) => String((r as any).userId)).filter(Boolean);
}
