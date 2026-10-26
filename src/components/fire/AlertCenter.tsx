import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { AlertTriangle, Bell, BellOff, Crosshair, Phone, X } from "lucide-react";
import { useFire, useFilteredData, analyticsAvailability } from "@/lib/fire/store";
import { computeAnomaly } from "@/lib/fire/analytics";
import { ALERT_RULES, computeAlerts, notifiable, SEVERITY_RANK, type FireAlert, type Severity } from "@/lib/fire/alerts";
import { EMERGENCY_DIRECTORY, SUPPORTED_EMERGENCY, emergencyFor } from "@/lib/fire/emergency";
import { SOURCE_LABELS } from "@/lib/fire/types";
import { cn } from "@/lib/utils";

interface Prefs {
  minSeverity: Severity;
  country: string | null;
  browser: boolean;
  dismissed: Record<string, Severity>;
  open: FireAlert | null;
  set: (p: Partial<Omit<Prefs, "set">>) => void;
}
const KEY = "fc-alert-prefs:v1";
export const useAlertPrefs = create<Prefs>((set) => ({
  minSeverity: "moderate",
  country: null,
  browser: false,
  dismissed: {},
  open: null,
  set: (p) =>
    set((s) => {
      const n = { ...s, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify({ minSeverity: n.minSeverity, country: n.country, browser: n.browser, dismissed: n.dismissed }));
      } catch { /* storage unavailable */ }
      return p;
    }),
}));

const SEV_STYLE: Record<Severity, string> = {
  critical: "border-destructive bg-destructive/15 text-destructive",
  high: "border-destructive/60 bg-destructive/10 text-destructive",
  moderate: "border-[var(--amber)]/60 bg-[var(--amber)]/10 text-[var(--amber)]",
  info: "border-border bg-muted text-muted-foreground",
};
const SEV_LABEL: Record<Severity, string> = { critical: "CRITICAL", high: "HIGH", moderate: "MODERATE", info: "INFORMATIONAL" };

/** Alerts derived from the most recent two loaded UTC days of the active dataset. */
export function useAlerts() {
  const data = useFilteredData();
  const mode = useFire((s) => s.mode);
  return useMemo(() => {
    if (!data) return null;
    const avail = [...analyticsAvailability(data)].sort();
    const days = [...data.available].sort().slice(-2);
    const last = days[days.length - 1];
    if (!last) return { alerts: [], expired: 0, days };
    const records = days.flatMap((d) => data.byDate.get(d) ?? []);
    const anomalies = new Map<string, ReturnType<typeof computeAnomaly>>();
    const availSet = new Set(avail);
    for (const [c, daily] of data.idx) anomalies.set(c, computeAnomaly(daily, availSet, last, 1));
    const simulated = data.ds.kind === "demo" || mode === "demo";
    // Demo data has synthetic timestamps; age is measured relative to its newest record.
    const newest = records.reduce((m, r) => (`${r.date}${r.time}` > m ? `${r.date}${r.time}` : m), "");
    const now = simulated && newest ? Date.parse(`${newest.slice(0, 10)}T${newest.slice(10, 12)}:${newest.slice(12, 14)}:00Z`) + 3.6e6 : Date.now();
    return { ...computeAlerts({ records, anomalies, sourceLabel: SOURCE_LABELS[data.ds.source], simulated, now }), days };
  }, [data, mode]);
}

function useHydratePrefs() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) useAlertPrefs.setState(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
}

/** Prominent banner above the globe; dismiss hides the notification, not the alert record. */
export function AlertBanner() {
  useHydratePrefs();
  const res = useAlerts();
  const prefs = useAlertPrefs();
  const status = useFire((s) => s.status);
  const mode = useFire((s) => s.mode);
  const error = useFire((s) => s.error);
  const notified = useRef(new Set<string>());
  const pending = res ? notifiable(res.alerts, prefs.dismissed, prefs.minSeverity, prefs.country) : [];
  const top = pending[0];

  useEffect(() => {
    if (!prefs.browser || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const a of pending) {
      const k = `${a.id}|${a.severity}`;
      if (notified.current.has(k) || a.simulated) continue;
      notified.current.add(k);
      new Notification(`FIRECHRONICLE · ${SEV_LABEL[a.severity]} · ${a.country}`, { body: `${a.title}. ${a.reason}`, tag: a.id });
    }
  }, [pending, prefs.browser]);

  if (mode === "live" && status === "error")
    return (
      <div role="status" className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <span><b>Live data unavailable.</b> Alerts cannot be evaluated. {error}</span>
      </div>
    );
  if (!res) return null;
  if (!top)
    return (
      <div role="status" data-testid="alert-none" className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Bell className="h-3.5 w-3.5" /> No qualifying alerts at ≥ {SEV_LABEL[prefs.minSeverity]} for {prefs.country ?? "all countries"} in the latest loaded day(s){res.expired ? ` · ${res.expired} expired as stale (> ${ALERT_RULES.STALE_HOURS} h)` : ""}.
      </div>
    );
  return (
    <div role="alert" data-testid="alert-banner" className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2", SEV_STYLE[top.severity])}>
      <button onClick={() => prefs.set({ open: top })} className="flex min-w-0 flex-1 items-start gap-2 text-left">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 text-xs text-foreground">
          <b className="font-mono">{SEV_LABEL[top.severity]}</b> · <b>{top.title}</b> — {top.country}
          <span className="block text-muted-foreground">
            Observed {top.observedAt.replace("T", " ").slice(0, 16)} UTC · Source NASA FIRMS {top.source} · {top.kind} alert · {top.reason}
          </span>
          <span className="block text-muted-foreground">Recommended: {top.action}{pending.length > 1 ? ` · +${pending.length - 1} more` : ""}</span>
        </span>
      </button>
      <LocateBtn a={top} />
      <button aria-label="Dismiss notification" onClick={() => prefs.set({ dismissed: { ...prefs.dismissed, [top.id]: top.severity } })} className="rounded p-1 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      {prefs.open && <AlertDrawer />}
    </div>
  );
}

function LocateBtn({ a }: { a: FireAlert }) {
  const set = useFire((s) => s.set);
  return (
    <button
      onClick={() => set({ country: a.country, focus: { lat: a.lat, lon: a.lon, dist: 1.6 }, autoRotate: false })}
      className="flex items-center gap-1 rounded border border-border bg-background/60 px-2 py-1 text-xs text-foreground"
    >
      <Crosshair className="h-3 w-3" /> Locate on globe
    </button>
  );
}

function AlertDrawer() {
  const a = useAlertPrefs((s) => s.open)!;
  const set = useAlertPrefs((s) => s.set);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/60" onClick={() => set({ open: null })}>
      <aside role="dialog" aria-label="Alert details" onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-4 text-sm text-foreground">
        <div className="flex items-start justify-between">
          <span className={cn("rounded border px-2 py-0.5 font-mono text-xs", SEV_STYLE[a.severity])}>{SEV_LABEL[a.severity]} · {a.kind}{a.simulated ? " · SIMULATED" : ""}</span>
          <button aria-label="Close" onClick={() => set({ open: null })}><X className="h-4 w-4" /></button>
        </div>
        <AlertBody a={a} />
      </aside>
    </div>
  );
}

function AlertBody({ a }: { a: FireAlert }) {
  return (
    <div className="space-y-2">
      <h3 className="mt-2 font-semibold">{a.title}</h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Country</dt><dd>{a.country}</dd>
        <dt className="text-muted-foreground">Cell centroid</dt><dd className="font-mono">{a.lat.toFixed(3)}, {a.lon.toFixed(3)}</dd>
        <dt className="text-muted-foreground">Cell bounds</dt><dd className="font-mono">lat {a.cell.lat0} to {a.cell.lat0 + a.cell.size}°, lon {a.cell.lon0} to {a.cell.lon0 + a.cell.size}°</dd>
        <dt className="text-muted-foreground">Newest observation</dt><dd className="font-mono">{a.observedAt.replace("T", " ").slice(0, 16)} UTC</dd>
        <dt className="text-muted-foreground">Data age</dt><dd className="font-mono">{a.ageHours.toFixed(1)} h</dd>
        <dt className="text-muted-foreground">Product</dt><dd>NASA FIRMS {a.source}</dd>
        <dt className="text-muted-foreground">Detections (country)</dt><dd className="font-mono">{a.detections}</dd>
        <dt className="text-muted-foreground">In cluster cell</dt><dd className="font-mono">{a.cellDetections} ({a.highConfidence} high-conf.)</dd>
      </dl>
      <p className="text-xs"><span className="text-muted-foreground">Why: </span>{a.reason}</p>
      <p className="text-xs text-muted-foreground">{a.uncertainty} This is {a.kind === "statistical" ? "a statistically generated" : "an observational"} FIRECHRONICLE alert — not an official warning.</p>
      <p className="rounded bg-muted px-2 py-1 text-xs">Informational next step: {a.action}</p>
      <div className="flex flex-wrap gap-2">
        <LocateBtn a={a} />
        <a className="rounded border border-border px-2 py-1 text-xs" href={`https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${a.lon.toFixed(2)},${a.lat.toFixed(2)},9z`} target="_blank" rel="noreferrer">Open in NASA FIRMS map ↗</a>
      </div>
      <EmergencyContacts initial={a.country} compact />
    </div>
  );
}

/** Country emergency directory. Independent of the satellite feed; never dials automatically. */
export function EmergencyContacts({ initial, compact }: { initial?: string | null; compact?: boolean }) {
  const [country, setCountry] = useState<string>(initial && EMERGENCY_DIRECTORY[initial] ? initial : SUPPORTED_EMERGENCY[0]!);
  const e = emergencyFor(country);
  const unsupported = initial && !EMERGENCY_DIRECTORY[initial];
  return (
    <section className={cn("rounded-md border border-border p-3", !compact && "bg-card")} data-testid="emergency-contacts">
      <h4 className="flex items-center gap-1 text-xs font-semibold"><Phone className="h-3 w-3" /> Contact Emergency Services</h4>
      {unsupported && <p className="mt-1 text-xs text-muted-foreground">No verified directory entry for {initial} yet — consult that country's official government portal. Showing a supported country below; check it is the right one.</p>}
      <label className="mt-2 flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Country</span>
        <select value={country} onChange={(ev) => setCountry(ev.target.value)} className="rounded border border-border bg-background px-2 py-1">
          {SUPPORTED_EMERGENCY.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      {e && (
        <div className="mt-2 space-y-1 text-xs">
          {e.numbers.map((n) => (
            <a key={n.number} href={`tel:${n.number}`} className="flex items-center justify-between rounded border border-destructive/50 px-2 py-1.5 hover:bg-destructive/10">
              <span>{n.label} — {e.country}</span>
              <b className="font-mono text-base text-destructive">{n.number}</b>
            </a>
          ))}
          <ul className="space-y-0.5">
            {e.agencies.map((g) => <li key={g.url}><a className="text-[var(--amber)] hover:underline" href={g.url} target="_blank" rel="noreferrer">{g.name} ↗</a></li>)}
          </ul>
          <p className="text-muted-foreground">
            Verified {e.verified} from <a className="underline" href={e.source.url} target="_blank" rel="noreferrer">{e.source.name}</a>. Tapping the number only opens your phone's dialer; nothing is called automatically. Satellite detections alone do not confirm an emergency.
          </p>
        </div>
      )}
    </section>
  );
}

/** Full alert list + preferences, for the Early Warning page. */
export function AlertCenter() {
  useHydratePrefs();
  const res = useAlerts();
  const prefs = useAlertPrefs();
  const [perm, setPerm] = useState<string>("unknown");
  useEffect(() => setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission), []);
  const list = res ? res.alerts.filter((a) => SEVERITY_RANK[a.severity] >= SEVERITY_RANK[prefs.minSeverity] && (!prefs.country || a.country === prefs.country)) : [];
  const enableBrowser = async () => {
    if (typeof Notification === "undefined") return setPerm("unsupported");
    const p = await Notification.requestPermission();
    setPerm(p);
    prefs.set({ browser: p === "granted" });
  };
  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="alert-center">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Fire Alert Center</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Evaluated from the latest two loaded UTC days ({res?.days.join(", ") || "none"}). Updates only while this dashboard is open and when data reloads — no background monitoring, email or SMS is configured. CRITICAL is reserved for official warnings, and no official feed is connected, so it is never generated.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Minimum severity" value={prefs.minSeverity} onChange={(e) => prefs.set({ minSeverity: e.target.value as Severity })} className="rounded border border-border bg-background px-2 py-1">
            <option value="info">≥ Informational</option><option value="moderate">≥ Moderate</option><option value="high">≥ High</option>
          </select>
          <select aria-label="Alert country" value={prefs.country ?? ""} onChange={(e) => prefs.set({ country: e.target.value || null })} className="rounded border border-border bg-background px-2 py-1">
            <option value="">All countries</option>
            {[...new Set(res?.alerts.map((a) => a.country) ?? [])].sort().map((c) => <option key={c}>{c}</option>)}
          </select>
          {prefs.browser && perm === "granted" ? (
            <button onClick={() => prefs.set({ browser: false })} className="flex items-center gap-1 rounded border border-border px-2 py-1"><BellOff className="h-3 w-3" /> Browser notifications on</button>
          ) : (
            <button onClick={enableBrowser} disabled={perm === "unsupported" || perm === "denied"} className="flex items-center gap-1 rounded border border-border px-2 py-1 disabled:opacity-50">
              <Bell className="h-3 w-3" /> {perm === "denied" ? "Notifications blocked in browser" : perm === "unsupported" ? "Notifications unsupported" : "Enable browser notifications"}
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {list.map((a) => (
          <article key={a.id} className={cn("rounded-md border p-3", SEV_STYLE[a.severity].split(" ")[0])}>
            <div className="flex items-start justify-between gap-2">
              <button onClick={() => prefs.set({ open: a })} className="text-left">
                <h3 className="text-sm font-semibold">{a.country} — {a.title}</h3>
                <div className="text-xs text-muted-foreground">{a.observedAt.replace("T", " ").slice(0, 16)} UTC · {a.kind}{prefs.dismissed[a.id] ? " · notification dismissed" : ""}</div>
              </button>
              <span className={cn("rounded border px-2 py-0.5 font-mono text-[10px]", SEV_STYLE[a.severity])}>{SEV_LABEL[a.severity]}</span>
            </div>
            <p className="mt-1 text-xs">{a.reason}</p>
            <div className="mt-2 flex gap-2"><LocateBtn a={a} /><button onClick={() => prefs.set({ open: a })} className="rounded border border-border px-2 py-1 text-xs">Details & emergency contacts</button></div>
          </article>
        ))}
        {res && !list.length && <p className="text-xs text-muted-foreground">No qualifying alerts for the current preferences.{res.expired ? ` ${res.expired} expired as stale.` : ""}</p>}
      </div>
      {prefs.open && <AlertDrawer />}
    </section>
  );
}
