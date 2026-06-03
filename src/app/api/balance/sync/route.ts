import { NextResponse } from "next/server";
import { syncCashBalanceFromBinance } from "@/lib/settings";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const userId = await getApiUserId();
    const result = await syncCashBalanceFromBinance(userId);
    return NextResponse.json({
      ok: !result.error,
      total: result.total,
      updatedAt: result.updatedAt,
      error: result.error,
      breakdown: result.breakdown,
      unpriced: result.unpriced,
      tickerOk: result.tickerOk,
    });
  } catch (e) {
    return apiError(e);
  }
}
