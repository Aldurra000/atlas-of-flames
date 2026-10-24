import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFire, useFilteredData, analyticsAvailability, scopeKey, type Prepared } from "@/lib/fire/store";
import { computeAnomaly, windowDates } from "@/lib/fire/analytics";
import { fmtShort, isoWeekKey, toUtc } from "@/lib/fire/dates";
import { cn } from "@/lib/utils";

export type Gran = "daily" | "weekly" | "monthly" | "seasonal";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function series(data: Prepared, scope: string, g: Gran) {
  const daily = data.idx.get(scope);
  const out = new Map<string, { k: string; label: string; count: number; days: number; missing: number }>();
  for (const d of data.ds.dates) {
    const miss = data.missing.has(d);
    const k = g === "daily" ? d : g === "weekly" ? isoWeekKey(d) : g === "monthly" ? d.slice(0, 7) : String(toUtc(d).getUTCMonth());
    const label = g === "daily" || g === "weekly" ? fmtShort(k) : g === "monthly" ? `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}` : MONTHS[Number(k)]!;
    let e = out.get(k);
    if (!e) out.set(k, (e = { k, label, count: 0, days: 0, missing: 0 }));
    if (miss) e.missing++;
    else {
      e.days++;
      e.count += daily?.get(d) ?? 0;
    }
  }
  const rows = [...out.values()];
  if (g === "seasonal") rows.sort((a, b) => Number(a.k) - Number(b.k));
  // seasonal & weekly/monthly expressed as mean detections per observed day so partial periods compare fairly
  return rows.map((r) => ({
    ...r,
    value: g === "daily" ? (r.missing ? null : r.count) : r.days ? +(r.count / r.days).toFixed(1) : null,
  }));
}

export function ActivityChart({ scope, gran, height = 220 }: { scope: string; gran: Gran; height?: number }) {
  const data = useFilteredData();
  const date = useFire((s) => s.selectedDate);
  const set = useFire((s) => s.set);
  const rows = useMemo(() => (data ? series(data, scope, gran) : []), [data, scope, gran]);
  if (!data) return null;
  if (gran === "seasonal" && data.available.size < 365) return <p className="text-xs text-muted-foreground">Insufficient history for annual seasonality: fewer than 365 retrieved days. No long-term forecast is produced.</p>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -16 }} onClick={(e) => gran === "daily" && e?.activeLabel && set({ selectedDate: rows.find((r) => r.label === e.activeLabel)?.k ?? date })}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} minTickGap={20} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", fontSize: 12 }}
            formatter={(v, _n, p) => [v == null ? "no observations" : v, gran === "daily" ? "detections" : `mean / observed day (${(p.payload as { days: number }).days} days)`]}
          />
          <Bar dataKey="value" fill="var(--fire)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GranTabs({ value, onChange }: { value: Gran; onChange: (g: Gran) => void }) {
  return (
    <div className="flex rounded-md border border-border p-0.5 text-xs">
      {(["daily", "weekly", "monthly", "seasonal"] as Gran[]).map((g) => (
        <button key={g} onClick={() => onChange(g)} className={cn("rounded px-2 py-0.5 capitalize", value === g ? "bg-secondary" : "text-muted-foreground")}>
          {g}
        </button>
      ))}
    </div>
  );
}

/** Calendar matrix: weeks × weekdays. Grey hatch = no observations available, dark = zero detections. */
export function CalendarMatrix({ scope }: { scope: string }) {
  const data = useFilteredData();
  const date = useFire((s) => s.selectedDate);
  const W = useFire((s) => s.windowDays);
  const set = useFire((s) => s.set);
  if (!data) return null;
  const dates = data.ds.dates;
  const daily = data.idx.get(scope);
  const max = Math.max(1, ...dates.map((d) => daily?.get(d) ?? 0));
  const first = toUtc(dates[0]!);
  const offset = (first.getUTCDay() + 6) % 7;
  const weeks = Math.ceil((dates.length + offset) / 7);
  const inWin = new Set(date ? windowDates(date, W) : []);
  return (
    <div className="overflow-x-auto">
      <svg width={weeks * 13 + 24} height={7 * 13 + 4} className="block">
        {["M", "", "W", "", "F", "", "S"].map((l, i) => (
          <text key={i} x={0} y={i * 13 + 10} fontSize={8} fill="var(--muted-foreground)">
            {l}
          </text>
        ))}
        {dates.map((d, i) => {
          const j = i + offset;
          const n = daily?.get(d) ?? 0;
          const miss = data.missing.has(d);
          const t = Math.log1p(n) / Math.log1p(max);
          return (
            <rect
              key={d}
              x={14 + Math.floor(j / 7) * 13}
              y={(j % 7) * 13}
              width={11}
              height={11}
              rx={2}
              onClick={() => set({ selectedDate: d })}
              className="cursor-pointer"
              fill={miss ? "url(#hatch)" : n === 0 ? "var(--muted)" : `color-mix(in oklab, var(--fire) ${Math.round(20 + 80 * t)}%, var(--ember) ${Math.round(80 - 80 * t)}%)`}
              opacity={miss ? 1 : n === 0 ? 1 : 0.35 + 0.65 * t}
              stroke={d === date ? "var(--foreground)" : inWin.has(d) ? "var(--amber)" : "none"}
              strokeWidth={d === date ? 1.5 : 0.8}
            >
              <title>{`${d}: ${miss ? "no observations available" : `${n} detections`}`}</title>
            </rect>
          );
        })}
        <defs>
          <pattern id="hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="3" fill="var(--secondary)" />
            <line x1="0" y1="0" x2="0" y2="3" stroke="var(--muted-foreground)" strokeWidth="1" />
          </pattern>
        </defs>
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-muted" /> zero detections</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--fire)]" /> more detections (log scale)</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground bg-secondary" /> no observations available</span>
      </div>
    </div>
  );
}

/** Repeated elevated periods: sliding the anomaly test across the record. */
export function useElevatedPeriods(country: string | null) {
  const data = useFilteredData();
  const W = useFire((s) => s.windowDays);
  const cfg = useFire((s) => s.anomaly);
  const date = useFire((s) => s.selectedDate);
  return useMemo(() => {
    if (!data) return [];
    const w = Math.max(W, 7);
    const daily = data.idx.get(scopeKey(country));
    const out: { end: string; obs: number; mean: number; z: number }[] = [];
    for (let i = data.ds.dates.length - 1; i >= 0; i -= w) {
      const end = data.ds.dates[i]!;
      if (date && end > date) continue;
      const a = computeAnomaly(daily, analyticsAvailability(data), end, w, cfg);
      if ((a.status === "elevated" || a.status === "strong") && a.baselineMean != null && a.z != null) out.push({ end, obs: a.observed, mean: a.baselineMean, z: a.z });
    }
    return out;
  }, [data, W, cfg, country, date]);
}
