"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useWorkspace } from "@/components/providers/workspace";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;

function useFmt() {
  const ws = useWorkspace();
  return {
    full: (minor: number) => formatMoney(minor, ws.currency, { locale: ws.locale }),
    compact: (minor: number) => formatMoney(minor, ws.currency, { locale: ws.locale, compact: true }),
  };
}

function TooltipBox({ label, rows }: { label: string; rows: Array<{ name: string; value: string; color: string }> }) {
  return (
    <div className="rounded-md border border-border bg-background-2 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{label}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: r.color }} />
          {r.name}: <span className="ml-auto pl-3 font-medium text-foreground tabular">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Grouped monthly bars: income (slot 1) vs expenses (slot 2). */
export function IncomeExpenseChart({ data, height = 240 }: { data: Array<{ label: string; incomeMinor: number; expenseMinor: number }>; height?: number }) {
  const f = useFmt();
  return (
    <div>
      <Legend items={[{ label: "Income", color: "var(--series-1)" }, { label: "Expenses", color: "var(--series-2)" }]} />
      <div style={{ height }} role="img" aria-label="Income versus expenses by month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={56} tickFormatter={(v) => f.compact(v)} />
            <Tooltip
              cursor={{ fill: "var(--card-2)", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={String(label)}
                    rows={[
                      { name: "Income", value: f.full(Number(payload[0]?.payload.incomeMinor ?? 0)), color: "var(--series-1)" },
                      { name: "Expenses", value: f.full(Number(payload[0]?.payload.expenseMinor ?? 0)), color: "var(--series-2)" },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="incomeMinor" name="Income" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expenseMinor" name="Expenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Single-series trend (area). */
export function TrendChart({ data, height = 200, name = "Spending", color = "var(--accent)", onPointClick }: { data: Array<{ label: string; valueMinor: number; key?: string }>; height?: number; name?: string; color?: string; onPointClick?: (key: string) => void }) {
  const f = useFmt();
  const id = `g-${name.replace(/\W/g, "")}`;
  return (
    <div style={{ height }} role="img" aria-label={`${name} trend`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 4, top: 6, bottom: 0 }} onClick={(e) => { const k = (e as { activePayload?: Array<{ payload?: { key?: string } }> })?.activePayload?.[0]?.payload?.key; if (k && onPointClick) onPointClick(k); }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} width={56} tickFormatter={(v) => f.compact(v)} />
          <Tooltip cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} content={({ active, payload, label }) => (active && payload?.length ? <TooltipBox label={String(label)} rows={[{ name, value: f.full(Number(payload[0].value)), color }]} /> : null)} />
          <Area type="monotone" dataKey="valueMinor" name={name} stroke={color} strokeWidth={2} fill={`url(#${id})`} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series line (e.g. net worth history). */
export function LineTrend({ data, height = 220, name = "Value" }: { data: Array<{ label: string; valueMinor: number }>; height?: number; name?: string }) {
  const f = useFmt();
  return (
    <div style={{ height }} role="img" aria-label={`${name} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} width={60} tickFormatter={(v) => f.compact(v)} />
          <Tooltip cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} content={({ active, payload, label }) => (active && payload?.length ? <TooltipBox label={String(label)} rows={[{ name, value: f.full(Number(payload[0].value)), color: "var(--accent)" }]} /> : null)} />
          <Line type="monotone" dataKey="valueMinor" name={name} stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent)", stroke: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Horizontal magnitude bars for part-to-whole breakdowns (categories,
 * allocation). One hue — magnitude, not identity — with values as text.
 */
export function BarList({ items, total, emptyLabel = "No data yet", max = 8, className }: { items: Array<{ key: string; label: string; valueMinor: number; sublabel?: string; tone?: "accent" | "success" | "warning" | "danger" }>; total?: number; emptyLabel?: string; max?: number; className?: string }) {
  const f = useFmt();
  if (!items.length) return <p className="py-6 text-center text-xs text-muted">{emptyLabel}</p>;
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  if (rest.length) shown.push({ key: "__other", label: `Other (${rest.length})`, valueMinor: rest.reduce((s, i) => s + i.valueMinor, 0) });
  const peak = Math.max(...shown.map((i) => i.valueMinor), 1);
  const sum = total ?? items.reduce((s, i) => s + i.valueMinor, 0);
  const tones = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger" };
  return (
    <ul className={cn("space-y-3", className)}>
      {shown.map((i) => (
        <li key={i.key} title={`${i.label}: ${f.full(i.valueMinor)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium">{i.label}</span>
            <span className="shrink-0 text-muted tabular">
              <span className="text-foreground">{f.full(i.valueMinor)}</span>
              {sum > 0 ? ` · ${Math.round((i.valueMinor / sum) * 1000) / 10}%` : ""}
              {i.sublabel ? ` · ${i.sublabel}` : ""}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-card-2">
            <div className={cn("h-full rounded-full", tones[i.tone ?? "accent"])} style={{ width: `${Math.max(2, (Math.max(0, i.valueMinor) / peak) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
