"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileNav } from "./Sidebar";
import { TopBar } from "./TopBar";

const CHROMELESS = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const bare = CHROMELESS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (bare) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <div className="md:ml-[220px] min-h-screen flex flex-col relative z-10">
        <TopBar />
        <main className="flex-1 p-4 sm:p-6 md:p-8 pb-24 md:pb-8">{children}</main>
      </div>
      <MobileNav />
    </>
  );
}
