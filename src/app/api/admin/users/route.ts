import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { inviteUser, listUsers } from "@/lib/users";

export async function GET() {
  try {
    await requireAdmin();
    const users = await listUsers();
    return NextResponse.json({ ok: true, users });
  } catch (e: any) {
    const status = e.message === "Forbidden" ? 403 : e.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const email = String(body.email || "").trim();
    const name = String(body.name || "").trim();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Email invalid" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: "Numele este obligatoriu" }, { status: 400 });
    }

    const result = await inviteUser({
      email,
      name,
      invitedById: session.user.id!,
      invitedByName: session.user.name || "Administrator",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const status =
      e.message === "Forbidden" ? 403 : e.message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
