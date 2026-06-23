export type AppRole = "admin" | "user" | "vip";

export type MemberRole = "user" | "vip";

export function normalizeRole(role: unknown): AppRole {
  if (role === "admin" || role === "vip" || role === "user") return role;
  return "user";
}

export function isAdmin(role: unknown): boolean {
  return normalizeRole(role) === "admin";
}

/** VIP + admin can open premium sections (stats, portfolio, analytics API). */
export function canAccessVipFeatures(role: unknown): boolean {
  const r = normalizeRole(role);
  return r === "admin" || r === "vip";
}

export function canAccessStats(role: unknown): boolean {
  return canAccessVipFeatures(role);
}

export function canAccessPortfolio(role: unknown): boolean {
  return canAccessVipFeatures(role);
}

export function roleLabel(role: unknown): string {
  const r = normalizeRole(role);
  if (r === "admin") return "administrator";
  if (r === "vip") return "VIP";
  return "User";
}
