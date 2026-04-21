import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";
import { getAccount } from "@/lib/binance";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // Optional override: test with freshly-submitted keys before saving
  const current = await getSettings();
  const apiKey = body.binanceApiKey && !body.binanceApiKey.includes("•") ? body.binanceApiKey : current.binanceApiKey;
  const apiSecret = body.binanceApiSecret && !body.binanceApiSecret.includes("•") ? body.binanceApiSecret : current.binanceApiSecret;
  const testnet = typeof body.binanceTestnet === "boolean" ? body.binanceTestnet : current.binanceTestnet;

  try {
    const acc = await getAccount(testnet, apiKey, apiSecret);
    const balances = (acc.balances || [])
      .filter((b: any) => +b.free > 0 || +b.locked > 0)
      .map((b: any) => ({ asset: b.asset, free: +b.free, locked: +b.locked }));
    return NextResponse.json({ ok: true, canTrade: acc.canTrade, balances });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.slice(0, 400) }, { status: 400 });
  }
}
