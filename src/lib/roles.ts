export type AppRole = "admin" | "user" | "vip";

export type MemberRole = "user" | "vip";

export function normalizeRole(role: unknown): AppRole {
  if (role === "admin" || role === "vip" || role === "user") return role;
  return "user";
}

export function isAdmin(role: unknown): boolean {
  return normalizeRole(role) === "admin";
}

/** VIP + admin can open /dashboard/stats and /api/analytics. */
export function canAccessStats(role: unknown): boolean {
  const r = normalizeRole(role);
  return r === "admin" || r === "vip";
}

export function roleLabel(role: unknown): string {
  const r = normalizeRole(role);
  if (r === "admin") return "administrator";
  if (r === "vip") return "VIP";
  return "User";
}
