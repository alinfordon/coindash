import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { deleteUser, resendInvite, setUserStatus } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json();

    if (body.action === "resend-invite") {
      const user = await resendInvite(id, session.user.name || "Administrator");
      return NextResponse.json({ ok: true, user });
    }

    const status = body.status as "active" | "disabled";
    if (status !== "active" && status !== "disabled") {
      return NextResponse.json({ ok: false, error: "status invalid" }, { status: 400 });
    }
    const user = await setUserStatus(id, status);
    return NextResponse.json({ ok: true, user });
  } catch (e: any) {
    const status =
      e.message === "Forbidden" ? 403 : e.message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireAdmin();
    const { id } = await ctx.params;
    await deleteUser(id, session.user.id!);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status =
      e.message === "Forbidden" ? 403 : e.message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
