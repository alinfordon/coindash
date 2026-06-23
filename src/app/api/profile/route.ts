import { NextResponse } from "next/server";
import { getUserProfile, updateUserProfile } from "@/lib/users";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getApiUserId();
    const profile = await getUserProfile(userId);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await getApiUserId();
    const body = await req.json();
    const patch: { name?: string; currentPassword?: string; newPassword?: string } = {};

    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.currentPassword === "string") patch.currentPassword = body.currentPassword;
    if (typeof body.newPassword === "string") patch.newPassword = body.newPassword;

    if (!patch.name && !patch.newPassword) {
      return NextResponse.json({ ok: false, error: "Nicio modificare trimisă" }, { status: 400 });
    }

    if (patch.newPassword && patch.newPassword !== body.confirmPassword) {
      return NextResponse.json({ ok: false, error: "Parolele noi nu coincid" }, { status: 400 });
    }

    const profile = await updateUserProfile(userId, patch);
    return NextResponse.json({
      ok: true,
      profile,
      nameUpdated: patch.name !== undefined,
      passwordUpdated: patch.newPassword !== undefined,
    });
  } catch (e) {
    return apiError(e);
  }
}
