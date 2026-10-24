import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useFire, useWindowData, useFilteredData, analyticsAvailability } from "@/lib/fire/store";
import { computePriorities } from "@/lib/fire/analytics";
import { SOURCE_LABELS } from "@/lib/fire/types";
import { fmtDate } from "@/lib/fire/dates";
import { windowDates } from "@/lib/fire/analytics";
import { Timeline } from "@/components/fire/Timeline";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/warning")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Early Warning & Monitoring Priorities — FIRECHRONICLE" },
      { name: "description", content: "Transparent monitoring priority assessment from observed detections and historical baselines." },
      { property: "og:title", content: "Early Warning — FIRECHRONICLE" },
      { property: "og:description", content: "Monitoring Priority Assessment — informational, not a forecast." },
    ],
  }),
  component: Warning,
});

export function usePriorities() {
  const data = useFilteredData();
  const date = useFire((s) => s.selectedDate);
  const W = useFire((s) => s.windowDays);
  const cfg = useFire((s) => s.anomaly);
  return useMemo(() => (data && date ? computePriorities(data.idx, analyticsAvailability(data), date, W, cfg) : []), [data, date, W, cfg]);
}

const LEVEL = { High: "text-destructive border-destructive/50", Medium: "text-[var(--amber)] border-[var(--amber)]/50", Low: "text-muted-foreground border-border" };

function Warning() {
  const pr = usePriorities();
  const win = useWindowData();
  const data = useFilteredData();
  const date = useFire((s) => s.selectedDate);
  const W = useFire((s) => s.windowDays);
  const country = useFire((s) => s.country);
  const list = (country ? pr.filter((p) => p.country === country) : pr).slice(0, 12);
  const unusual = list.filter((p) => p.anomaly.status === "elevated" || p.anomaly.status === "strong");
  const period = date ? `${fmtDate(windowDates(date, W)[0]!)} – ${fmtDate(date)}` : "";
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Early Warning · Monitoring Priority Assessment</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          This is not a fire forecast. FIRECHRONICLE ranks areas for additional monitoring using observed detections, persistence and deviation from the historical baseline. No weather, drought or vegetation data is integrated.
        </p>
      </div>
      <Timeline />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Cat n={1} title={data?.ds.kind === "demo" ? "Synthetic demonstration observations" : "Confirmed satellite observations"} status={!data || !win?.avail.length ? "unavailable" : data.ds.kind === "demo" ? "demo" : data.ds.truncated || win.missing.length ? "partial" : "available"}>
          {win?.records.length.toLocaleString()} detections across {[...(win?.byCountry.keys() ?? [])].length} regions, {period}.
        </Cat>
        <Cat n={2} title="Statistically unusual activity" status={unusual.length || !list.every((p) => p.anomaly.status === "insufficient") ? "available" : "limited"}>
          {(!list.length || list.every((p) => p.anomaly.status === "insufficient")) ? "Insufficient historical data for baseline comparison." : `${unusual.length} region(s) above the trailing baseline.`}
        </Cat>
        <Cat n={3} title="Estimated potential risk" status="not integrated">
          Requires weather, fuel-moisture or drought datasets, which are not integrated. No risk estimate is produced.
        </Cat>
        <Cat n={4} title="Official warnings" status="not integrated">
          No agency feed is connected. Consult national services, GWIS (gwis.jrc.ec.europa.eu) or EFFIS (effis.jrc.ec.europa.eu).
        </Cat>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Monitoring priorities {country ? `— ${country}` : ""}</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          score = 0.4 × recent activity (log-scaled to the most active region) + 0.3 × persistence (share of observed days with detections) + 0.3 × anomaly (z/4, capped at 1; 0 when the baseline is insufficient). High ≥ 0.60, Medium ≥ 0.35.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((p) => (
            <article key={p.country} className={cn("rounded-md border p-3", LEVEL[p.level].split(" ")[1])}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{p.country}</h3>
                  <div className="text-xs text-muted-foreground">{period}</div>
                </div>
                <span className={cn("rounded border px-2 py-0.5 font-mono text-xs", LEVEL[p.level])}>
                  {p.level} · {p.score.toFixed(2)}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted-foreground">Detections</dt><dd className="font-mono">{p.recent.toLocaleString()}</dd></div>
                <div><dt className="text-muted-foreground">Baseline</dt><dd className="font-mono">{p.anomaly.baselineMean != null ? p.anomaly.baselineMean.toFixed(1) : "insufficient"}</dd></div>
                <div><dt className="text-muted-foreground">Persistence</dt><dd className="font-mono">{Math.round(p.persistence * 100)}%</dd></div>
              </dl>
              <p className="mt-2 text-xs"><span className="text-muted-foreground">Why: </span>{p.reasons.join("; ")}.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Components R {p.components.recent.toFixed(2)} · P {p.components.persistence.toFixed(2)} · A {p.components.anomaly.toFixed(2)} · Source {data ? SOURCE_LABELS[data.ds.source] : ""} · retrieved-day availability {Math.round(p.anomaly.coverage * 100)}%
              </p>
              <p className="mt-2 rounded bg-muted px-2 py-1 text-xs">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Informational suggestion · </span>
                {p.action}
              </p>
            </article>
          ))}
          {!list.length && <p className="text-sm text-muted-foreground">{win?.avail.length ? "No matching detections on retrieved days." : "Observations unavailable in this window."}</p>}
        </div>
      </section>
    </div>
  );
}

function Cat({ n, title, status, children }: { n: number; title: string; status: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Category {n}</span>
        <span className={status === "available" ? "text-[var(--live)]" : "text-muted-foreground"}>{status}</span>
      </div>
      <h3 className="mt-1 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{children}</p>
    </div>
  );
}
