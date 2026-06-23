import { NextResponse } from "next/server";
import { getVipDonationConfig } from "@/lib/vipDonation";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getApiUserId();
    const config = await getVipDonationConfig();
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    return apiError(e);
  }
}
