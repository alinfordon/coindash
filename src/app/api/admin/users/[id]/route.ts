import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdmin } from "@/lib/session";
import { deleteUser, resendInvite, updateUserByAdmin } from "@/lib/users";
import type { MemberRole } from "@/lib/roles";

type Ctx = { params: Promise<{ id: string }> };

function patchErrorStatus(message: string) {
  if (message === "Forbidden") return 403;
  if (message === "Unauthorized") return 401;
  if (message === "Utilizator negăsit") return 404;
  return 400;
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireAdmin();
    const { id: rawId } = await ctx.params;
    const id = rawId?.trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return NextResponse.json({ ok: false, error: "ID utilizator invalid" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Body JSON invalid" }, { status: 400 });
    }

    if (body.action === "resend-invite") {
      const user = await resendInvite(id, session.user.name || "Administrator");
      return NextResponse.json({ ok: true, user });
    }

    const patch: { name?: string; role?: MemberRole; status?: "active" | "disabled" } = {};
    if (body.name !== undefined) patch.name = String(body.name);
    if (body.role === "user" || body.role === "vip") patch.role = body.role;
    if (body.status === "active" || body.status === "disabled") patch.status = body.status;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nicio modificare validă (rol/status necunoscut sau body gol)" },
        { status: 400 }
      );
    }

    const user = await updateUserByAdmin(id, session.user.id!, patch);
    return NextResponse.json({ ok: true, user, reloginRequired: patch.role !== undefined });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "Eroare la actualizare";
    if (e instanceof Error && e.name === "ValidationError") {
      console.error("[admin/users PATCH] validation", e.message);
    } else {
      console.error("[admin/users PATCH]", message);
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: patchErrorStatus(message) }
    );
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
