"use client";

import type { ComponentPropsWithoutRef } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = ({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn(
      "inline-flex items-center gap-1 rounded-xl border border-border/70 bg-surface-2/50 p-1 backdrop-blur-sm",
      className
    )}
    {...props}
  />
);

const TabsTrigger = ({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "rounded-lg px-3 py-1.5 text-[11px] font-heading uppercase tracking-widest text-text-muted transition-all",
      "data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary/35 data-[state=active]:shadow-neon",
      "hover:text-text-primary border border-transparent",
      className
    )}
    {...props}
  />
);

const TabsContent = ({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn("outline-none mt-4 animate-fadeUp", className)} {...props} />
);

export { Tabs, TabsList, TabsTrigger, TabsContent };
