import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Crosshair, Pause, Play, RotateCcw } from "lucide-react";
import { useFire, useWindowData, type Viz } from "@/lib/fire/store";
import { cn } from "@/lib/utils";

const Globe = lazy(() => import("./Globe"));

const VIZ: { id: Viz; label: string }[] = [
  { id: "flames", label: "3D Flames" },
  { id: "columns", label: "Activity Columns" },
  { id: "heat", label: "Heat Density" },
  { id: "clusters", label: "Clusters" },
];

const BUCKET_LABEL = {
  far: { flames: "Aggregated · 2° cells", columns: "2° cells", clusters: "4° clusters", heat: "1° density" },
  mid: { flames: "Aggregated · 0.5° cells", columns: "1° cells", clusters: "1.5° clusters", heat: "0.5° density" },
  near: { flames: "Individual detections", columns: "0.25° cells", clusters: "0.5° clusters", heat: "0.25° density" },
} as const;

export function GlobePanel({ className }: { className?: string }) {
  const viz = useFire((s) => s.viz);
  const bucket = useFire((s) => s.zoomBucket);
  const autoRotate = useFire((s) => s.autoRotate);
  const country = useFire((s) => s.country);
  const set = useFire((s) => s.set);
  const win = useWindowData();
  const fallback = <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Initializing globe…</div>;
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-border bg-[var(--space)]", className)}>
      <ClientOnly fallback={fallback}>
        <Suspense fallback={fallback}>
          <Globe />
        </Suspense>
      </ClientOnly>

      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-1 rounded-md border border-border bg-background/80 p-1 backdrop-blur">
          {VIZ.map((v) => (
            <button
              key={v.id}
              onClick={() => set({ viz: v.id })}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                viz === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex gap-1">
          <IconBtn label={autoRotate ? "Pause rotation" : "Auto-rotate"} onClick={() => set({ autoRotate: !autoRotate })}>
            {autoRotate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn label="Reset camera" onClick={() => set({ focus: { lat: 15, lon: 10, dist: 3 } })}>
            <RotateCcw className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 max-w-[16rem] rounded-md border border-border bg-background/80 p-3 text-[11px] leading-relaxed backdrop-blur">
        <div className="mb-1.5 flex items-center gap-2 font-mono uppercase tracking-wider text-muted-foreground">
          <Crosshair className="h-3 w-3" /> {viz === "flames" && bucket === "near" && (win?.records.length ?? 0) > 20000 ? "Aggregated · 0.1° cells · all records" : BUCKET_LABEL[bucket][viz]}
        </div>
        <div className="mb-1.5 h-1.5 w-full rounded-full bg-[image:var(--gradient-fire)]" />
        <div className="flex justify-between text-muted-foreground">
          <span>fewer</span>
          <span>more detections</span>
        </div>
        <p className="mt-1.5 text-muted-foreground">
          Flame size, color and motion are symbols — not measured fire size or intensity. Click a symbol for the source record; click land to select a country.
        </p>
        {country && <p className="mt-1 text-[var(--amber)]">Selected: {country}</p>}
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-md border border-border bg-background/80 p-2 text-muted-foreground backdrop-blur hover:text-foreground"
    >
      {children}
    </button>
  );
}
