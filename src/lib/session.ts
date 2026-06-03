import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { authOptions } from "./authOptions";

export type AppRole = "admin" | "user";

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
  if (session.user.role !== "admin") throw new Error("Forbidden");
  return session;
}

export async function getTokenRole(req: NextRequest): Promise<AppRole | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const role = token?.role as AppRole | undefined;
  return role === "admin" || role === "user" ? role : null;
}
