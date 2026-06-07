import { cn } from "@/lib/utils";
import { HTMLAttributes, type ReactNode } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass glass-hover p-5 animate-fadeUp", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between mb-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-heading text-sm tracking-widest uppercase text-text-muted", className)}
      {...props}
    />
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
  variant = "card",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "primary" | "success" | "danger" | "secondary";
  variant?: "card" | "embedded";
  className?: string;
}) {
  const accentBar =
    accent === "success"
      ? "from-success/80"
      : accent === "danger"
        ? "from-danger/80"
        : accent === "secondary"
          ? "from-secondary/80"
          : "from-primary/80";

  const border =
    accent === "success"
      ? "border-success/30"
      : accent === "danger"
        ? "border-danger/30"
        : accent === "secondary"
          ? "border-secondary/30"
          : "border-primary/25";

  const embedded = variant === "embedded";

  return (
    <div
      className={cn(
        "relative overflow-hidden h-full flex flex-col justify-between",
        embedded
          ? "px-4 py-3.5 sm:px-5 sm:py-4 min-h-[5.5rem] bg-transparent"
          : cn("glass glass-hover p-5", border),
        className
      )}
    >
      {!embedded && (
        <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
      )}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b to-transparent opacity-90",
          accentBar
        )}
      />
      <div className="pl-2">
        <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-text-muted font-heading leading-tight">
          {label}
        </div>
        <div className={cn("mt-1.5 font-mono font-semibold tabular-nums", embedded ? "text-xl sm:text-2xl" : "text-2xl")}>
          {value}
        </div>
        {sub && <div className="mt-1 text-[10px] sm:text-xs text-text-muted leading-snug">{sub}</div>}
      </div>
    </div>
  );
}
