"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  CandlestickChart,
  History,
  LineChart,
  Settings,
  Cpu,
  Activity,
  LogOut,
  User,
  BarChart3,
  Shield,
  TrendingUp,
  Crown,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessStats, roleLabel } from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  locked?: boolean;
};

const coreNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { href: "/positions", label: "Positions", short: "Pos", icon: Activity },
  { href: "/history", label: "History", short: "Log", icon: History },
  { href: "/analysis", label: "Analysis", short: "AI", icon: LineChart },
  { href: "/piata", label: "Market", short: "Mkt", icon: TrendingUp },
  { href: "/settings", label: "Settings", short: "Cfg", icon: Settings },
];

const portofoliuNavItem: NavItem = {
  href: "/portofoliu",
  label: "Portofolio",
  short: "Port",
  icon: Briefcase,
};

const statsNavItem: NavItem = {
  href: "/dashboard/stats",
  label: "Statistics",
  short: "Stats",
  icon: BarChart3,
};

const adminNavItem: NavItem = {
  href: "/admin",
  label: "Admin",
  short: "Adm",
  icon: Shield,
};

function useNavItems(): NavItem[] {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const statsItem: NavItem = {
    ...statsNavItem,
    locked: !canAccessStats(role),
  };
  const items: NavItem[] = [
    coreNav[0],
    ...coreNav.slice(1, 5),
    statsItem,
    portofoliuNavItem,
    coreNav[5],
  ];
  if (role === "admin") {
    return [...items, adminNavItem];
  }
  return items;
}

const lockedNavClass =
  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm border border-transparent text-text-muted/50 cursor-not-allowed opacity-55 select-none";

const lockedMobileNavClass =
  "relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] mono tracking-widest uppercase text-text-muted/45 cursor-not-allowed opacity-55 select-none";

function isNavActive(pathname: string | null, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/";
  }
  return pathname?.startsWith(href) ?? false;
}

export function Sidebar() {
  const pathname = usePathname();
  const nav = useNavItems();
  return (
    <aside
      className="hidden md:flex fixed top-0 left-0 h-screen w-[220px] z-30 flex-col border-r border-border/80 bg-surface/70 backdrop-blur-xl"
    >
      <div className="px-5 py-6 border-b border-border/70">
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-primary/30 to-secondary/30 border border-primary/40 flex items-center justify-center shadow-neon group-hover:animate-pulseGlow">
            <Cpu className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-heading font-bold tracking-wider text-sm text-text-primary">
              NEXUS<span className="text-primary">.</span>TRADE
            </div>
            <div className="text-[10px] mono tracking-[0.2em] text-text-muted">v1.0 · AUTONOMOUS</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((n) => {
          const Icon = n.icon;
          if (n.locked) {
            return (
              <span key={n.href} title="Disponibil pentru VIP" className={lockedNavClass}>
                <Icon className="h-4 w-4" />
                <span className="font-medium">{n.label}</span>
                <Crown className="h-3.5 w-3.5 text-secondary/70 ml-auto shrink-0" />
              </span>
            );
          }
          const active = isNavActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition group",
                active
                  ? "bg-primary/10 text-primary border border-primary/30 shadow-neon"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-2/70 border border-transparent"
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-primary")} />
              <span className="font-medium">{n.label}</span>
              {active && (
                <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-primary shadow-neon" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border/70 space-y-3">
        <SessionCard />
        <div className="glass p-3 text-[11px] text-text-muted">
          <div className="flex items-center gap-2 mb-1">
            <CandlestickChart className="h-3.5 w-3.5 text-secondary" />
            <span className="mono text-text-primary">MARKET DATA</span>
          </div>
          Live from Binance API. OCO TP/SL automated. Dry-run mode available in settings.
        </div>
      </div>
    </aside>
  );
}

function SessionCard() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const name = session?.user?.name || "guest";
  const role = session?.user?.role;
  const onProfile = pathname === "/profile";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border bg-surface-2/60 px-3 py-2 transition",
        onProfile ? "border-primary/40 bg-primary/5" : "border-border/70"
      )}
    >
      <Link
        href="/profile"
        title="Profil"
        className="flex items-center gap-2 min-w-0 flex-1 rounded-md hover:opacity-90 transition"
      >
        <div className="h-7 w-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-text-primary truncate">{name}</div>
          <div className="text-[9px] mono uppercase tracking-widest text-text-muted">
            {roleLabel(role)}
          </div>
        </div>
      </Link>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        title="Sign out"
        className="h-7 w-7 rounded-md border border-border hover:border-danger/50 hover:text-danger flex items-center justify-center text-text-muted transition shrink-0"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Bottom-fixed navigation for mobile (<md). Scroll when many routes. */
export function MobileNav() {
  const pathname = usePathname();
  const nav = useNavItems();
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/80 bg-surface/80 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex overflow-x-auto overscroll-x-contain">
        {nav.map((n) => {
          const Icon = n.icon;
          if (n.locked) {
            return (
              <span
                key={n.href}
                title="Disponibil pentru VIP"
                className={cn(lockedMobileNavClass, "min-w-[4.25rem] shrink-0 px-1")}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  <Crown className="h-2.5 w-2.5 text-secondary/70 absolute -top-1 -right-2.5" />
                </span>
                <span>{n.short}</span>
              </span>
            );
          }
          const active = isNavActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-[4.25rem] shrink-0 px-1 text-[10px] mono tracking-widest uppercase transition",
                active ? "text-primary" : "text-text-muted hover:text-text-primary"
              )}
            >
              {active && (
                <span className="absolute inset-x-2 top-0 h-0.5 rounded-b bg-primary shadow-neon" />
              )}
              <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_rgba(0,245,255,0.7)]")} />
              <span>{n.short}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
