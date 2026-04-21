import { NextResponse } from "next/server";

export function checkCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return null;

  const auth = req.headers.get("authorization") ?? "";
  const headerSecret = req.headers.get("x-cron-secret") ?? "";

  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";

  if (bearer === secret || headerSecret === secret) return null;

  return NextResponse.json(
    { ok: false, error: "Unauthorized cron" },
    { status: 401 }
  );
}
