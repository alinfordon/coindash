import { NextResponse } from "next/server";
import { getInvestPortfolioView, updateInvestPortfolio } from "@/lib/investPortfolio";
import { getApiUserId, apiError } from "@/lib/apiUser";
import type { InvestTarget } from "@/models/InvestPortfolio";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getApiUserId();
    const portfolio = await getInvestPortfolioView(userId);
    return NextResponse.json({ ok: true, portfolio });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await getApiUserId();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Body JSON invalid" }, { status: 400 });
    }

    const patch: { name?: string; rebalanceThresholdPct?: number; targets?: InvestTarget[] } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.rebalanceThresholdPct === "number") {
      patch.rebalanceThresholdPct = body.rebalanceThresholdPct;
    }
    if (Array.isArray(body.targets)) {
      patch.targets = body.targets
        .filter((t: any) => t && typeof t.asset === "string")
        .map((t: any) => ({
          asset: String(t.asset).trim().toUpperCase(),
          weightPct: +t.weightPct || 0,
        }));
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "Nicio modificare trimisă" }, { status: 400 });
    }

    await updateInvestPortfolio(userId, patch);
    const portfolio = await getInvestPortfolioView(userId);
    return NextResponse.json({ ok: true, portfolio });
  } catch (e) {
    return apiError(e);
  }
}
