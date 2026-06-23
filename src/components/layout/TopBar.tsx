"use client";

import useSWR from "swr";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Zap, Pause, Cpu, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";

type StatsBrief = { pilotActive: boolean; openPositions: number };

export function TopBar() {
  const { data } = useSWR<StatsBrief>("/api/dashboard/stats");
  const pilot = data?.pilotActive ?? false;
  return (
    <header className="sticky top-0 z-20 h-14 border-b border-border/70 bg-surface/60 backdrop-blur-xl flex items-center justify-between px-4 md:px-6">
      {/* Mobile logo (sidebar is hidden on mobile) */}
      <Link href="/dashboard" className="md:hidden flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/30 to-secondary/30 border border-primary/40 flex items-center justify-center shadow-neon">
          <Cpu className="h-4 w-4 text-primary" />
        </div>
        <div className="font-heading font-bold tracking-wider text-sm">
          NEXUS<span className="text-primary">.</span>TRADE
        </div>
      </Link>

      {/* Desktop status strip */}
      <div className="hidden md:flex items-center gap-3 text-xs mono tracking-widest text-text-muted">
        <span className="text-primary">●</span>
        <span>LIVE · BINANCE</span>
        <span className="text-text-muted/50">|</span>
        <span>{new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })}</span>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <span className={cn("chip", pilot ? "border-success/40 text-success" : "border-text-muted/30 text-text-muted")}>
          <span className={cn("pulse-dot", !pilot && "off")} style={{ background: pilot ? "#00FF88" : undefined }} />
          {pilot ? (
            <>
              <Zap className="h-3 w-3" />
              <span className="hidden sm:inline">AI PILOT · </span>ACTIVE
            </>
          ) : (
            <>
              <Pause className="h-3 w-3" />
              <span className="hidden sm:inline">AI PILOT · </span>PAUSED
            </>
          )}
        </span>
        <span className="chip border-secondary/30 text-secondary">
          <span className="pulse-dot" style={{ background: "#7B2FFF" }} />
          {data?.openPositions ?? 0} <span className="hidden sm:inline">OPEN</span>
        </span>
        <Link
          href="/profile"
          title="Profil"
          className="md:hidden h-8 w-8 rounded-md border border-border hover:border-primary/50 hover:text-primary flex items-center justify-center text-text-muted transition"
        >
          <User className="h-4 w-4" />
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Sign out"
          className="md:hidden h-8 w-8 rounded-md border border-border hover:border-danger/50 hover:text-danger flex items-center justify-center text-text-muted transition"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
