import { NextResponse } from "next/server";
import { requireUserId } from "./session";

export async function getApiUserId(): Promise<string> {
  return requireUserId();
}

export function apiError(e: unknown, fallback = "Request failed") {
  const msg = e instanceof Error ? e.message : fallback;
  const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}
