import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { AILog } from "@/models/AILog";
import { userScope } from "@/lib/tenant";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await connectDB();
    const userId = await getApiUserId();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(+(searchParams.get("limit") || 20), 200);
    const logs = await AILog.find(userScope(userId))
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    return NextResponse.json({ logs });
  } catch (e) {
    return apiError(e);
  }
}
