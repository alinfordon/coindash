import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { AILog } from "@/models/AILog";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(+(searchParams.get("limit") || 20), 200);
  const logs = await AILog.find().sort({ timestamp: -1 }).limit(limit).lean();
  return NextResponse.json({ logs });
}
