import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Flame, Loader2, Menu, RefreshCw, Satellite, X } from "lucide-react";
import { useFire } from "@/lib/fire/store";
import { LIVE_SOURCES, SOURCE_LABELS, type LiveSource } from "@/lib/fire/types";
import { REGION_PRESETS, resolveRegion } from "@/lib/fire/firms";
import { fmtDate, todayUtc } from "@/lib/fire/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
          SIMULATED DEMO DATA — NOT LIVE NASA OBSERVATIONS
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
          <Button variant="ghost" className="xl:hidden" aria-label="Menu" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
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
  const confirmed = s.mode === "live" && ds?.kind === "live" && s.status === "ready";
  const [cfg, setCfg] = useState(false);
  return (
    <div className="border-t border-border/60 bg-card/60">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
        <span className={cn("inline-flex items-center gap-1 font-bold", confirmed ? "text-[var(--live)]" : "text-[var(--amber)]")}>
          <Satellite className="h-3 w-3" /> {s.mode === "demo" ? "SIMULATED DEMO MODE" : s.refreshError ? "STALE NASA DATA" : confirmed ? "LIVE NASA FIRMS" : s.status === "error" ? "LIVE UNAVAILABLE" : "AWAITING NASA FIRMS"}
        </span>
        <span>{ds ? SOURCE_LABELS[ds.source] : "—"}</span>
        {ds && <span>{resolveRegion(ds.region)?.label ?? ds.region}</span>}
        {ds && (
          <span>
            {fmtDate(ds.dates[0] ?? "")} → {fmtDate(ds.dates.at(-1) ?? "")}
          </span>
        )}
        {ds && <span>last successful refresh {ds.fetchedAt.replace("T", " ").slice(0, 19)} UTC</span>}
        {ds && <span>{ds.records.length.toLocaleString()} loaded{ds.kind === "live" ? ` / ${(ds.returnedRecordCount ?? ds.records.length).toLocaleString()} NASA rows returned` : " synthetic records"}</span>}
        {(s.status === "loading" || s.refreshing) && (
          <span className="inline-flex items-center gap-1 text-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> {ds ? "refreshing" : "loading"}
          </span>
        )}
        {s.status === "error" && (
          <span role="alert" className="inline-flex items-center gap-1 text-destructive">
            <AlertTriangle className="h-3 w-3" /> {s.error}
          </span>
        )}
        {ds && <span>{ds.truncated ? "INCOMPLETE RECORDS · lower bounds" : "No application truncation"}</span>}
        {ds && ds.missingDates.length > 0 && <span className="text-[var(--amber)]">{ds.missingDates.length} unavailable date(s) · totals incomplete</span>}
        {s.refreshError && <span role="alert" className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> {s.refreshError}</span>}
        {s.mode === "live" && <Button variant="ghost" size="sm" disabled={s.refreshing} onClick={s.requestRefresh}><RefreshCw className="h-3 w-3" /> Refresh Now</Button>}
        <Button variant="ghost" onClick={() => setCfg(!cfg)} className="ml-auto rounded border border-border px-2 py-0.5 text-foreground hover:bg-muted">
          Data source
        </Button>
      </div>
      {ds && ds.notes.length > 0 && <div className="mx-auto max-w-[1600px] px-4 pb-2 text-xs text-muted-foreground">{ds.notes.join(" ")}</div>}
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
        <Button variant="ghost" onClick={() => s.set({ mode: "demo" })} className={cn("rounded-md px-3 py-1.5", s.mode === "demo" ? "bg-[var(--amber)] text-background" : "border border-border")}>
          Demo
        </Button>
        <Button variant="ghost"
          disabled={!s.liveConfigured}
          onClick={() => s.set({ mode: "live", live: { ...draft } })}
          className={cn("rounded-md px-3 py-1.5 disabled:opacity-40", s.mode === "live" ? "bg-[var(--live)] text-background" : "border border-border")}
        >
          Live FIRMS
        </Button>
      </div>
      {s.liveConfigured === false ? (
        <p className="text-muted-foreground">
          Live observations are unavailable until a NASA FIRMS key is configured. Demo observations appear only when Demo is explicitly selected.
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
              {!REGION_PRESETS[draft.region] && <option value={draft.region}>{resolveRegion(draft.region)?.label ?? "Custom area"}</option>}
              {REGION_PRESETS[draft.region] && <option value="bbox:-10,35,5,44">Custom bounding box…</option>}
            </select>
          </label>
          {!REGION_PRESETS[draft.region] && (
            <label className="grid gap-0.5 text-xs text-muted-foreground">
              Custom area W,S,E,N (°)
              <input
                className={cn(sel, "w-48 font-mono", !resolveRegion(draft.region) && "border-destructive")}
                defaultValue={draft.region.slice(5)}
                onChange={(e) => setDraft({ ...draft, region: `bbox:${e.target.value.replace(/\s/g, "")}` })}
                aria-label="Custom bounding box"
              />
            </label>
          )}
          <label className="grid gap-0.5 text-xs text-muted-foreground">
            End date (UTC)
            <input type="date" className={sel} max={todayUtc()} value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
          </label>
          <label className="grid gap-0.5 text-xs text-muted-foreground">
            Days (1–10)
            <input type="number" min={1} max={10} className={cn(sel, "w-20")} value={draft.days} onChange={(e) => setDraft({ ...draft, days: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
          </label>
          <label className="grid gap-0.5 text-xs text-muted-foreground">
            Auto refresh
            <select className={sel} value={s.refreshMinutes} onChange={(e) => s.set({ refreshMinutes: Number(e.target.value) })}>
              <option value={0}>Off</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </label>
          <Button variant="ghost"
            disabled={!resolveRegion(draft.region)}
            onClick={() => {
              s.set({ mode: "live", live: { ...draft } });
              onClose();
            }}
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
          >
            Load observations
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Requests retrieve complete daily responses for up to 10 days; no 20,000-record sampling cap. Automatic refresh runs only while this app is open, subject to NASA limits. Use Standard (SP) products for older archive dates. Short live ranges cannot support historical baselines.
          </p>
        </div>
      )}
    </div>
  );
}
