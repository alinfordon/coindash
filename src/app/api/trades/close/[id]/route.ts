import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { closePosition } from "@/lib/trading";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
  await connectDB();
  const userId = await getApiUserId();
  const { id } = await ctx.params;
  const settings = await getSettings(userId);
  try {
    const t = await closePosition(id, userId, "MANUAL", settings);
    return NextResponse.json({ ok: true, trade: t });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
  } catch (e) {
    return apiError(e);
  }
}
