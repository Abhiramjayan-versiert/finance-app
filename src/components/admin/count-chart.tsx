"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CountChart({ data, name, height = 220 }: { data: Array<{ label: string; value: number }>; name: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={name}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--card-2)" }} contentStyle={{ background: "var(--background-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [v, name]} />
          <Bar dataKey="value" name={name} fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
