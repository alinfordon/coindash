import { NextResponse } from "next/server";
import { acceptInvite } from "@/lib/users";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body.token || "");
    const password = String(body.password || "");
    if (!token) {
      return NextResponse.json({ ok: false, error: "Token lipsă" }, { status: 400 });
    }
    const result = await acceptInvite(token, password);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
