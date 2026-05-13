import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: "neutral" | "success" | "danger" | "warning" | "accent" }) {
  const styles =
    variant === "success"
      ? "border-success/35 bg-success/10 text-success"
      : variant === "danger"
      ? "border-danger/35 bg-danger/10 text-danger"
      : variant === "warning"
      ? "border-amber-400/35 bg-amber-400/10 text-amber-300"
      : variant === "accent"
      ? "border-secondary/35 bg-secondary/10 text-secondary"
      : "border-border/70 bg-surface-2/60 text-text-muted";

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-heading uppercase tracking-wider",
        styles,
        className
      )}
      {...props}
    />
  );
}
