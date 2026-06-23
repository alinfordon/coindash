import { NextResponse } from "next/server";
import { generatePortfolioAiAdvice, getInvestPortfolioView } from "@/lib/investPortfolio";
import { getApiUserId } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const userId = await getApiUserId();
    const advice = await generatePortfolioAiAdvice(userId);
    const portfolio = await getInvestPortfolioView(userId);
    return NextResponse.json({ ok: true, advice, portfolio });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Eroare AI";
    const status = msg === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
