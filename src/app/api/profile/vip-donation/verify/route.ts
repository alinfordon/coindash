import { NextResponse } from "next/server";
import { verifyVipDonation } from "@/lib/vipDonation";
import { getApiUserId } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const userId = await getApiUserId();
    const body = await req.json();
    const txId = typeof body.txId === "string" ? body.txId : "";
    const result = await verifyVipDonation(userId, txId);
    return NextResponse.json({ ok: true, ...result, message: "Contul tău a fost upgradat la VIP" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    const status = msg === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
