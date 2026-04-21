import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

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
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "primary" | "success" | "danger" | "secondary";
  className?: string;
}) {
  const border =
    accent === "success"
      ? "border-success/30"
      : accent === "danger"
      ? "border-danger/30"
      : accent === "secondary"
      ? "border-secondary/30"
      : "border-primary/25";
  return (
    <div className={cn("glass glass-hover p-5 relative overflow-hidden", border, className)}>
      <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
      <div className="text-[11px] uppercase tracking-[0.25em] text-text-muted font-heading">{label}</div>
      <div className="mt-2 text-2xl font-mono font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-text-muted">{sub}</div>}
    </div>
  );
}
