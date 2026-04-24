import { NextResponse } from "next/server";
import { syncCashBalanceFromBinance } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await syncCashBalanceFromBinance();
  return NextResponse.json({
    ok: !result.error,
    total: result.total,
    updatedAt: result.updatedAt,
    error: result.error,
  });
}
