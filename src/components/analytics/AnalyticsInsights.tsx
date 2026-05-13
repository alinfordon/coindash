"use client";

import type { AnalyticsInsights as InsightModel } from "@/lib/analytics";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

export function AnalyticsInsightsPanel({ insights }: { insights: InsightModel }) {
  const badge =
    insights.severity === "critical" ? (
      <Badge variant="danger">Risk</Badge>
    ) : insights.severity === "warning" ? (
      <Badge variant="warning">Review</Badge>
    ) : (
      <Badge variant="accent">Signals</Badge>
    );

  return (
    <Card className="border-primary/15 shadow-[0_0_40px_-18px_rgba(0,245,255,0.35)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 normal-case tracking-normal text-text-primary">
          <Sparkles className="h-4 w-4 text-primary" /> Quant Insights
        </CardTitle>
        {badge}
      </CardHeader>
      <ul className="space-y-3 text-sm leading-relaxed text-text-primary/95">
        {insights.bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-neon" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
