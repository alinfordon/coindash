import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Providers } from "@/components/layout/Providers";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "NEXUS TRADE — Autonomous AI Crypto Pilot",
  description: "Autonomous AI-powered crypto trading dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen scanline-overlay mesh-bg">
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              className: "font-body",
              style: {
                background: "rgba(13,24,33,0.9)",
                border: "1px solid rgba(0,245,255,0.3)",
                color: "#E8F4FF",
                backdropFilter: "blur(12px)",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
