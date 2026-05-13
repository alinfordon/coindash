"use client";

import type { ComponentPropsWithoutRef } from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border/70 bg-surface-2 transition-colors",
        "data-[state=checked]:bg-primary/25 data-[state=checked]:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-text-muted shadow-lg ring-0 transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-primary"
        )}
      />
    </SwitchPrimitives.Root>
  );
}
