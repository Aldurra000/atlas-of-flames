import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Flame, Loader2, Menu, Satellite, X } from "lucide-react";
import { useFire } from "@/lib/fire/store";
import { LIVE_SOURCES, SOURCE_LABELS, type LiveSource } from "@/lib/fire/types";
import { REGION_PRESETS } from "@/lib/fire/firms";
import { fmtDate, todayUtc } from "@/lib/fire/dates";
import { cn } from "@/lib/utils";
import { CountrySelect } from "./CountrySelect";

const NAV = [
  { to: "/", label: "Global Overview" },
  { to: "/explorer", label: "Fire Explorer" },
  { to: "/history", label: "Historical Analysis" },
  { to: "/warning", label: "Early Warning" },
  { to: "/country", label: "Country Intelligence" },
  { to: "/methodology", label: "Methodology" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const mode = useFire((s) => s.mode);
  return (
    <div className="min-h-screen">
      {mode === "demo" && (
        <div className="sticky top-0 z-50 bg-[var(--amber)] px-3 py-1 text-center font-mono text-[11px] font-bold uppercase tracking-widest text-background">
          Demo data — not live NASA observations
        </div>
      )}
      <header className={cn("sticky z-40 border-b border-border bg-background/90 backdrop-blur", mode === "demo" ? "top-6" : "top-0")}>
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-[var(--fire)]" />
            <div className="leading-tight">
              <div className="font-display text-sm font-bold tracking-[0.2em]">FIRECHRONICLE</div>
              <div className="hidden text-[10px] text-muted-foreground sm:block">Global Fire Intelligence & Historical Analysis</div>
            </div>
          </Link>
          <nav className="ml-4 hidden items-center gap-0.5 xl:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-secondary !text-foreground" }}
                activeOptions={{ exact: true }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden md:block">
            <CountrySelect />
          </div>
          <button className="xl:hidden" aria-label="Menu" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <nav className="grid gap-1 border-t border-border px-4 py-2 xl:hidden">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="rounded px-2 py-1.5 text-sm" activeProps={{ className: "bg-secondary" }} activeOptions={{ exact: true }}>
                {n.label}
              </Link>
            ))}
            <div className="py-1 md:hidden">
              <CountrySelect />
            </div>
          </nav>
        )}
        <DataStatusBar />
      </header>
      <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4">{children}</main>
    </div>
  );
}

function DataStatusBar() {
  const s = useFire();
  const ds = s.data?.ds;
  const [cfg, setCfg] = useState(false);
  return (
    <div className="border-t border-border/60 bg-card/60">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
        <span className={cn("inline-flex items-center gap-1 font-bold", s.mode === "live" ? "text-[var(--live)]" : "text-[var(--amber)]")}>
          <Satellite className="h-3 w-3" /> {s.mode === "live" ? "LIVE NASA FIRMS" : "DEMO MODE"}
        </span>
        <span>{ds ? SOURCE_LABELS[ds.source] : "—"}</span>
        {ds && <span>{REGION_PRESETS[ds.region]?.label ?? ds.region}</span>}
        {ds && (
          <span>
            {fmtDate(ds.dates[0]!)} → {fmtDate(ds.dates[ds.dates.length - 1]!)}
          </span>
        )}
        {ds && <span>refreshed {new Date(ds.fetchedAt).toISOString().slice(11, 16)} UTC</span>}
        {ds && <span>{ds.records.length.toLocaleString()} records</span>}
        {s.status === "loading" && (
          <span className="inline-flex items-center gap-1 text-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> loading
          </span>
        )}
        {s.status === "error" && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertTriangle className="h-3 w-3" /> {s.error}
          </span>
        )}
        {ds?.truncated && <span className="text-[var(--amber)]">truncated</span>}
        <button onClick={() => setCfg(!cfg)} className="ml-auto rounded border border-border px-2 py-0.5 text-foreground hover:bg-muted">
          Data source
        </button>
      </div>
      {cfg && <DataSourcePanel onClose={() => setCfg(false)} />}
    </div>
  );
}

function DataSourcePanel({ onClose }: { onClose: () => void }) {
  const s = useFire();
  const [draft, setDraft] = useState({ ...s.live, endDate: s.live.endDate ?? todayUtc() });
  const sel = "rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  return (
    <div className="mx-auto grid max-w-[1600px] gap-3 border-t border-border px-4 py-3 text-sm md:grid-cols-[auto_1fr]">
      <div className="flex gap-1">
        <button onClick={() => s.set({ mode: "demo" })} className={cn("rounded-md px-3 py-1.5", s.mode === "demo" ? "bg-[var(--amber)] text-background" : "border border-border")}>
          Demo
        </button>
        <button
          disabled={!s.liveConfigured}
          onClick={() => s.set({ mode: "live", live: { ...draft } })}
          className={cn("rounded-md px-3 py-1.5 disabled:opacity-40", s.mode === "live" ? "bg-[var(--live)] text-background" : "border border-border")}
        >
          Live FIRMS
        </button>
      </div>
      {s.liveConfigured === false ? (
        <p className="text-muted-foreground">
          Live mode needs a NASA FIRMS MAP_KEY stored server-side as <code className="text-foreground">FIRMS_MAP_KEY</code>. Get one free at firms.modaps.eosdis.nasa.gov/api/map_key. Until then, only clearly labeled synthetic demo records are shown.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-0.5 text-xs text-muted-foreground">
            Product
            <select className={sel} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as LiveSource })}>
              {LIVE_SOURCES.map((x) => (
                <option key={x} value={x}>
                  {SOURCE_LABELS[x]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-0.5 text-xs text-muted-foreground">
            Region
            <select className={sel} value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })}>
              {Object.entries(REGION_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-0.5 text-xs text-muted-foreground">
            End date (UTC)
            <input type="date" className={sel} max={todayUtc()} value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
          </label>
          <label className="grid gap-0.5 text-xs text-muted-foreground">
            Days (1–10)
            <input type="number" min={1} max={10} className={cn(sel, "w-20")} value={draft.days} onChange={(e) => setDraft({ ...draft, days: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
          </label>
          <button
            onClick={() => {
              s.set({ mode: "live", live: { ...draft } });
              onClose();
            }}
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
          >
            Load observations
          </button>
          <p className="w-full text-xs text-muted-foreground">
            Requests are limited to 10 days and 20,000 detections. Use Standard (SP) products for older archive dates. Short live ranges cannot support historical baselines.
          </p>
        </div>
      )}
    </div>
  );
}
