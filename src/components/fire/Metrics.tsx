import { Info } from "lucide-react";
import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFire, useWindowData, useFilteredData, analyticsAvailability } from "@/lib/fire/store";
import { computeAnomaly } from "@/lib/fire/analytics";

export function Metric({ label, value, sub, tip }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tip: string }) {
  return (
    <div className="min-w-0 border-l border-border pl-3">
      <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
        <Tooltip>
          <TooltipTrigger aria-label={`About ${label}`}>
            <Info className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{tip}</TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function useAnomalyFlags() {
  const data = useFilteredData();
  const date = useFire((s) => s.selectedDate);
  const W = useFire((s) => s.windowDays);
  const cfg = useFire((s) => s.anomaly);
  const country = useFire((s) => s.country);
  return useMemo(() => {
    if (!data || !date) return null;
    const rows = [...data.idx.entries()]
      .filter(([k]) => k !== "__ALL__" && k !== "Unassigned" && (!country || k === country))
      .map(([country, daily]) => ({ country, a: computeAnomaly(daily, analyticsAvailability(data), date, W, cfg) }));
    const insufficient = rows.length === 0 || rows.every((r) => r.a.status === "insufficient");
    return { rows, flagged: rows.filter((r) => r.a.status === "elevated" || r.a.status === "strong"), insufficient };
  }, [data, date, W, cfg, country]);
}

export function MetricsBar() {
  const win = useWindowData();
  const data = useFilteredData();
  const country = useFire((s) => s.country);
  const flags = useAnomalyFlags();
  if (!win || !data) return <div className="h-20 animate-pulse rounded-lg bg-card" />;
  const top = [...win.byCountry.entries()].filter(([k]) => k !== "Unassigned").sort((a, b) => b[1] - a[1])[0];
  const nCountries = [...win.byCountry.keys()].filter((k) => k !== "Unassigned").length;
  const fl = country ? flags?.flagged.filter((f) => f.country === country) : flags?.flagged;
  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-5">
      <Metric
        label="Detections"
        value={win.avail.length ? `${data.ds.truncated || win.missing.length ? "≥ " : ""}${win.records.length.toLocaleString()}` : "Unavailable"}
        sub={`${country ?? "All regions"} · filtered loaded records`}
        tip="Number of satellite active-fire detections (pixels) in the selected window that pass the current filters. One fire can produce many detections; this is not a count of unique fires."
      />
      <Metric
        label="Countries"
        value={country ? (win.records.length ? 1 : 0) : nCountries}
        sub="with ≥1 detection"
        tip="Countries (Natural Earth 1:110m boundaries) containing at least one detection in the window. Coastal and offshore detections may be unassigned at this boundary resolution."
      />
      <Metric
        label="Highest activity"
        value={<span className="text-lg">{top?.[0] ?? "—"}</span>}
        sub={top ? `${top[1].toLocaleString()} loaded detections` : win.avail.length ? "no matching detections" : "observations unavailable"}
        tip="Country with the most detections in the selected window. Raw counts are influenced by country area, satellite overpass geometry and cloud cover."
      />
      <Metric
        label="Unusual activity"
        value={flags?.insufficient ? <span className="text-base text-muted-foreground">Insufficient history</span> : (fl?.length ?? 0)}
        sub={flags?.insufficient ? "baseline needs earlier data" : "regions above baseline"}
        tip="Regions whose detection count in the window exceeds the trailing historical baseline by the configured z-score threshold (see Methodology). Requires enough preceding data with adequate coverage."
      />
      <Metric
        label="Retrieved days"
        value={`${win.avail.length} / ${win.dates.length}`}
        sub="Not satellite / geographic coverage"
        tip="Share of days in the selected window with observations available. Days with no data retrieved are 'missing', which is different from days with zero detections."
      />
    </div>
  );
}

export function Ranking({ limit = 8 }: { limit?: number }) {
  const win = useWindowData();
  const country = useFire((s) => s.country);
  const set = useFire((s) => s.set);
  if (!win) return null;
  const rows = [...win.byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const max = rows[0]?.[1] ?? 1;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Activity ranking</h3>
      <p className="mb-3 text-xs text-muted-foreground">Filtered loaded detections in window — not unique fires.</p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{win.avail.length ? "No matching detections on retrieved days." : "Observations unavailable in this window."}</p>}
      <ol className="space-y-1.5">
        {rows.map(([c, n], i) => (
          <li key={c}>
            <button
              onClick={() => c !== "Unassigned" && set({ country: country === c ? null : c })}
              className={`group w-full text-left ${country === c ? "text-[var(--amber)]" : ""}`}
            >
              <div className="flex justify-between text-xs">
                <span className="truncate">
                  <span className="mr-2 font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  {c === "Unassigned" ? "Unassigned / offshore" : c}
                </span>
                <span className="font-mono tabular-nums">{n.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-muted">
                <div className="h-1 rounded-full bg-[image:var(--gradient-fire)]" style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
