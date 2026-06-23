import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { canAccessStats } from "@/lib/roles";

const PUBLIC_PATHS = [
  "/login",
  "/invite",
  "/api/auth",
  "/api/cron",
  "/_next",
  "/favicon.ico",
];

const ADMIN_PATHS = ["/admin", "/api/admin"];
const STATS_PATHS = ["/dashboard/stats", "/api/analytics"];

function isHtmlNavigation(req: NextRequest) {
  return req.method === "GET" && req.headers.get("accept")?.includes("text/html");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    if (req.method === "GET" && req.headers.get("accept")?.includes("text/html")) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    if (token.role !== "admin") {
      if (isHtmlNavigation(req)) {
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }

  if (STATS_PATHS.some((p) => pathname.startsWith(p))) {
    if (!canAccessStats(token.role)) {
      if (isHtmlNavigation(req)) {
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)).*)"],
};
