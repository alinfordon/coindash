"use client";

import { SWRConfig } from "swr";
import { SessionProvider } from "next-auth/react";

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (r.status === 401) {
      // Session expired — bounce to login
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
          refreshInterval: 10000,
          revalidateOnFocus: true,
          shouldRetryOnError: true,
        }}
      >
        {children}
      </SWRConfig>
    </SessionProvider>
  );
}
