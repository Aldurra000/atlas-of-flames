import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ActivityChart, CalendarMatrix, GranTabs, useElevatedPeriods, type Gran } from "@/components/fire/Charts";
import { useAnomalyFlags } from "@/components/fire/Metrics";
import { Timeline } from "@/components/fire/Timeline";
import { scopeKey, useFire } from "@/lib/fire/store";
import { addDays, fmtDate } from "@/lib/fire/dates";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Historical Analysis — FIRECHRONICLE" },
      { name: "description", content: "Daily, weekly, monthly and seasonal fire-detection trends with baseline anomaly detection." },
      { property: "og:title", content: "Historical Analysis — FIRECHRONICLE" },
      { property: "og:description", content: "Trends, baselines and statistically unusual periods of satellite fire activity." },
    ],
  }),
  component: History,
});

function History() {
  const [gran, setGran] = useState<Gran>("daily");
  const country = useFire((s) => s.country);
  const W = useFire((s) => s.windowDays);
  const cfg = useFire((s) => s.anomaly);
  const set = useFire((s) => s.set);
  const flags = useAnomalyFlags();
  const periods = useElevatedPeriods(country);
  const rows = [...(flags?.rows ?? [])].sort((a, b) => (b.a.z ?? -99) - (a.a.z ?? -99)).slice(0, 15);
  const scope = scopeKey(country);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Historical Analysis</h1>
        <p className="text-sm text-muted-foreground">Scope: {country ?? "All regions"} · window {W} day(s). Select a country in the search box or on the globe.</p>
      </div>
      <Timeline />
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Activity trend — {country ?? "all regions"}</h2>
          <GranTabs value={gran} onChange={setGran} />
        </div>
        <ActivityChart scope={scope} gran={gran} height={240} />
        <p className="mt-2 text-xs text-muted-foreground">
          Daily: detections per day (gaps = no observations available). Weekly / monthly / seasonal: mean detections per observed day, so partial periods and missing days do not bias comparisons.
        </p>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Activity calendar</h2>
        <CalendarMatrix scope={scope} />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Anomaly detection by country</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Trailing baseline: {cfg.baselineWindows} preceding {W}-day windows; flag at z ≥ {cfg.zThreshold} (strong ≥ {cfg.strongZ}) and ≥ {cfg.minCount} detections.
          </p>
          <div className="mb-3 flex flex-wrap gap-3 text-xs">
            <Num label="z threshold" v={cfg.zThreshold} step={0.5} onChange={(v) => set({ anomaly: { ...cfg, zThreshold: v } })} />
            <Num label="strong z" v={cfg.strongZ} step={0.5} onChange={(v) => set({ anomaly: { ...cfg, strongZ: v } })} />
            <Num label="min count" v={cfg.minCount} step={1} onChange={(v) => set({ anomaly: { ...cfg, minCount: v } })} />
          </div>
          {flags?.insufficient ? (
            <p className="rounded border border-border p-3 text-sm text-muted-foreground">
              Insufficient historical data. The loaded range does not contain {cfg.minValidWindows} prior {W}-day windows with ≥{cfg.minCoverage * 100}% retrieved days and at least 28 preceding observed days; incomplete samples cannot establish a baseline.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1">Country</th><th>Observed</th><th>Baseline</th><th>Δ</th><th>z</th><th>Days retrieved</th><th>Status</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {rows.map(({ country: c, a }) => (
                    <tr key={c} className="border-t border-border" title={a.reason}>
                      <td className="py-1 font-sans">{c}</td>
                      <td>{a.observed}</td>
                      <td>{a.baselineMean?.toFixed(1) ?? "—"}</td>
                      <td>{a.ratio ? `${a.ratio.toFixed(1)}×` : "—"}</td>
                      <td>{a.z?.toFixed(2) ?? "—"}</td>
                      <td>{Math.round(a.coverage * 100)}%</td>
                      <td className={a.status === "strong" ? "text-destructive" : a.status === "elevated" ? "text-[var(--amber)]" : "text-muted-foreground"}>{a.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Repeated elevated periods — {country ?? "all regions"}</h2>
          <p className="mb-3 text-xs text-muted-foreground">Non-overlapping {Math.max(W, 7)}-day windows across the record that passed the anomaly test.</p>
          {periods.length ? (
            <ul className="space-y-1.5 text-xs">
              {periods.map((p) => (
                <li key={p.end}>
                  <button onClick={() => set({ selectedDate: p.end })} className="flex w-full justify-between rounded px-2 py-1 hover:bg-muted">
                    <span>{fmtDate(addDays(p.end, -(Math.max(W, 7) - 1)))} – {fmtDate(p.end)}</span>
                    <span className="font-mono text-[var(--amber)]">{p.obs} vs {p.mean.toFixed(0)} · z {p.z.toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No elevated periods found, or insufficient history to evaluate.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Num({ label, v, step, onChange }: { label: string; v: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-muted-foreground">
      {label}
      <input type="number" step={step} min={0} value={v} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} className="w-16 rounded border border-input bg-background px-1.5 py-0.5 text-foreground" />
    </label>
  );
}
