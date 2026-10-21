import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { GlobePanel } from "@/components/fire/GlobePanel";
import { Seg, Timeline } from "@/components/fire/Timeline";
import { useFire, useWindowData } from "@/lib/fire/store";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Fire Explorer — FIRECHRONICLE" },
      { name: "description", content: "Filter and inspect individual satellite active-fire detections by date, confidence, FRP and day/night." },
      { property: "og:title", content: "Fire Explorer — FIRECHRONICLE" },
      { property: "og:description", content: "Inspect individual NASA FIRMS active-fire detections on a 3D globe." },
    ],
  }),
  component: Explorer,
});

function Explorer() {
  const filters = useFire((s) => s.filters);
  const set = useFire((s) => s.set);
  const win = useWindowData();
  const top = useMemo(() => [...(win?.records ?? [])].sort((a, b) => (b.frp ?? -1) - (a.frp ?? -1)).slice(0, 60), [win]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Fire Explorer</h1>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-3">
        <Seg label="Day/Night" options={[{ v: "all", l: "All" }, { v: "D", l: "Day" }, { v: "N", l: "Night" }]} value={filters.daynight} onChange={(v) => set({ filters: { ...filters, daynight: v as "all" | "D" | "N" } })} />
        <Seg label="Confidence" options={[{ v: "all", l: "All" }, { v: "nominal", l: "≥ Nominal" }, { v: "high", l: "High" }]} value={filters.minConfidence} onChange={(v) => set({ filters: { ...filters, minConfidence: v as "all" | "nominal" | "high" } })} />
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Min FRP (MW)
          <input type="number" min={0} value={filters.minFrp} onChange={(e) => set({ filters: { ...filters, minFrp: Math.max(0, Number(e.target.value) || 0) } })} className="w-20 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground" />
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{win?.records.length.toLocaleString() ?? 0} detections match</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <GlobePanel className="h-[60vh] min-h-[380px]" />
          <Timeline />
        </div>
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-3">
            <h3 className="text-sm font-semibold">Highest-FRP detections</h3>
            <p className="text-xs text-muted-foreground">Click to open the source record and fly to it.</p>
          </div>
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {top.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => set({ selection: { type: "detection", detection: r }, focus: { lat: r.lat, lon: r.lon, dist: 1.35 }, autoRotate: false })}
                  className="grid w-full grid-cols-[1fr_auto] gap-x-3 px-3 py-2 text-left text-xs hover:bg-muted"
                >
                  <span className="truncate">{r.country ?? "Unassigned"}</span>
                  <span className="font-mono text-[var(--amber)]">{r.frp ?? "—"} MW</span>
                  <span className="font-mono text-muted-foreground">
                    {r.lat.toFixed(3)}, {r.lon.toFixed(3)}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {r.date} {r.time}
                  </span>
                </button>
              </li>
            ))}
            {!top.length && <li className="p-3 text-xs text-muted-foreground">No detections match the current filters.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
