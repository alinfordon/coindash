import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { authOptions } from "./authOptions";
import { canAccessStats, isAdmin, normalizeRole, type AppRole } from "./roles";

export type { AppRole };

export async function getAppSession() {
  return getServerSession(authOptions);
}

export async function requireSession() {
  const session = await getAppSession();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session;
}

export async function requireUserId(): Promise<string> {
  const session = await requireSession();
  return session.user.id!;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (!isAdmin(session.user.role)) throw new Error("Forbidden");
  return session;
}

export async function requireStatsAccess() {
  const session = await requireSession();
  if (!canAccessStats(session.user.role)) throw new Error("Forbidden");
  return session;
}

export async function getTokenRole(req: NextRequest): Promise<AppRole | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.role) return null;
  return normalizeRole(token.role);
}
