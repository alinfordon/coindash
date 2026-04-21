"use client";

import useSWR from "swr";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

export function HourlyBars() {
  const { data } = useSWR<{ hours: { hour: number; pnl: number; label: string }[] }>("/api/dashboard/hourly");
  const hours = data?.hours || [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hourly Realized P&L · Last 24H</CardTitle>
      </CardHeader>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hours}>
            <CartesianGrid strokeDasharray="2 2" stroke="#1A2A3A" />
            <XAxis
              dataKey="label"
              stroke="#5A7A9A"
              fontSize={10}
              tick={{ fill: "#5A7A9A" }}
              interval={2}
              tickLine={false}
              axisLine={false}
            />
            <YAxis stroke="#5A7A9A" fontSize={10} tick={{ fill: "#5A7A9A" }} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              contentStyle={{
                background: "rgba(13,24,33,0.95)",
                border: "1px solid #1A2A3A",
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(v: any) => [`$${(+v).toFixed(2)}`, "P&L"]}
            />
            <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
              {hours.map((h, i) => (
                <Cell key={i} fill={h.pnl >= 0 ? "#00FF88" : "#FF3366"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
