import { NextResponse } from "next/server";
import { validateInviteToken } from "@/lib/users";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Token lipsă" }, { status: 400 });
  }
  const result = await validateInviteToken(token);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
