import { ExternalLink, LocateFixed, X } from "lucide-react";
import { useFire } from "@/lib/fire/store";
import { SOURCE_LABELS } from "@/lib/fire/types";
import { fmtDate } from "@/lib/fire/dates";
import { windowDates } from "@/lib/fire/analytics";

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-4 border-b border-border/60 py-1.5 text-sm">
    <dt className="text-muted-foreground">{k}</dt>
    <dd className="text-right font-mono tabular-nums">{v ?? "n/a"}</dd>
  </div>
);

export function HotspotDrawer() {
  const sel = useFire((s) => s.selection);
  const set = useFire((s) => s.set);
  const date = useFire((s) => s.selectedDate);
  const W = useFire((s) => s.windowDays);
  if (!sel) return null;
  const loc = sel.type === "detection" ? sel.detection : sel.cell;
  return (
    <aside
      role="dialog"
      aria-label="Observation details"
      className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto border-t border-border bg-popover p-5 shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:top-20 sm:w-[24rem] sm:rounded-lg sm:border"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--amber)]">
            {sel.type === "detection" ? "Satellite active-fire detection" : "Aggregated geographic cell"}
          </div>
          <h2 className="text-lg font-semibold">
            {sel.type === "detection" ? (sel.detection.country ?? "Unassigned location") : `${sel.cell.count.toLocaleString()} detections`}
          </h2>
        </div>
        <button aria-label="Close" onClick={() => set({ selection: null })} className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {sel.type === "detection" ? (
        <>
          {sel.detection.isDemo && (
            <p className="mb-3 rounded border border-[var(--amber)]/50 bg-[var(--amber)]/10 p-2 text-xs text-[var(--amber)]">
              DEMO DATA — synthetic record, not a NASA observation.
            </p>
          )}
          <dl>
            <Row k="Latitude, longitude" v={`${sel.detection.lat.toFixed(4)}, ${sel.detection.lon.toFixed(4)}`} />
            <Row k="Acquired (UTC)" v={`${sel.detection.date} ${sel.detection.time.slice(0, 2)}:${sel.detection.time.slice(2)}`} />
            <Row k="Product" v={SOURCE_LABELS[sel.detection.source]} />
            <Row k="Instrument / satellite" v={`${sel.detection.instrument ?? "?"} / ${sel.detection.satellite ?? "?"}`} />
            <Row k="Confidence" v={sel.detection.confidence ? `${sel.detection.confidence} (${sel.detection.confidenceLevel})` : null} />
            <Row k="Brightness temp." v={sel.detection.brightness != null ? `${sel.detection.brightness} K` : null} />
            <Row k="Secondary brightness" v={sel.detection.brightness2 != null ? `${sel.detection.brightness2} K` : null} />
            <Row k="Fire Radiative Power" v={sel.detection.frp != null ? `${sel.detection.frp} MW` : null} />
            <Row k="Day / night" v={sel.detection.daynight === "D" ? "Day" : sel.detection.daynight === "N" ? "Night" : null} />
            <Row k="Scan × track" v={sel.detection.scan != null ? `${sel.detection.scan} × ${sel.detection.track}` : null} />
            <Row k="Version" v={sel.detection.version} />
          </dl>
          <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">ID {sel.detection.id}</p>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">Original source fields</summary>
            <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(sel.detection.raw, null, 1)}</pre>
          </details>
          <p className="mt-2 text-xs text-muted-foreground">
            Source: NASA FIRMS (Fire Information for Resource Management System). A detection marks a pixel containing one or more thermal anomalies; it is not a fire perimeter.
          </p>
        </>
      ) : (
        <dl>
          <Row k="Cell bounds" v={`${sel.cell.lat0.toFixed(2)}…${(sel.cell.lat0 + sel.cell.size).toFixed(2)}°, ${sel.cell.lon0.toFixed(2)}…${(sel.cell.lon0 + sel.cell.size).toFixed(2)}°`} />
          <Row k="Cell size" v={`${sel.cell.size}° × ${sel.cell.size}°`} />
          <Row k="Detections" v={sel.cell.count.toLocaleString()} />
          <Row k="Date range" v={date ? `${fmtDate(windowDates(date, W)[0]!)} – ${fmtDate(date)}` : null} />
          <Row k="Max / total FRP" v={sel.cell.maxFrp != null ? `${sel.cell.maxFrp.toFixed(1)} / ${sel.cell.sumFrp.toFixed(0)} MW` : null} />
          <Row k="Countries" v={sel.cell.countries.join(", ") || "Unassigned"} />
          <Row k="Products" v={sel.cell.products.join(", ")} />
          <p className="mt-2 text-xs text-muted-foreground">
            Aggregation: detections binned into a regular lat/lon grid; symbol placed at the mean position of members. Zoom in to see individual detections.
          </p>
        </dl>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => set({ focus: { lat: loc.lat, lon: loc.lon, dist: sel.type === "detection" ? 1.35 : 1.8 }, autoRotate: false })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          <LocateFixed className="h-4 w-4" /> Locate on Globe
        </button>
        {sel.type === "detection" && !sel.detection.isDemo && (
          <a
            href={`https://firms.modaps.eosdis.nasa.gov/map/#d:${sel.detection.date};@${sel.detection.lon.toFixed(3)},${sel.detection.lat.toFixed(3)},11z`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm"
          >
            FIRMS map <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </aside>
  );
}
