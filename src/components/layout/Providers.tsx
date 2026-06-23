"use client";

import { SWRConfig } from "swr";
import { SessionProvider } from "next-auth/react";
import { SWR_STATIC } from "@/lib/swrDefaults";

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (r.status === 401) {
      if (typeof window !== "undefined") window.location.href = "/login";
      return null;
    }
    return r.json();
  });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SWRConfig
        value={{
          fetcher,
          ...SWR_STATIC,
          shouldRetryOnError: true,
        }}
      >
        {children}
      </SWRConfig>
    </SessionProvider>
  );
}
