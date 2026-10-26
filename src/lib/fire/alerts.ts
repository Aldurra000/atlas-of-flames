import type { Detection } from "./types";
import type { AnomalyResult } from "./analytics";

/**
 * FIRECHRONICLE in-app alert rules (pure, documented, tested in src/test/alerts.test.ts).
 *
 * Alerts are generated per country from the most recent loaded UTC day(s).
 * Severity never depends on raw count alone:
 *  - CRITICAL: reserved for verified official warnings. No official feed is integrated,
 *    so FIRECHRONICLE never generates CRITICAL.
 *  - HIGH (observational): a 0.5° cell holding ≥ HIGH_CLUSTER detections, of which
 *    ≥ HIGH_CONF are high-confidence, observed within FRESH_HOURS of now.
 *    Or a "strong" statistical anomaly (z ≥ 3) that is also fresh.
 *  - MODERATE (statistical): "elevated"/"strong" anomaly vs the trailing baseline.
 *  - INFORMATIONAL (observational): a 0.5° cell with ≥ INFO_CLUSTER nominal/high detections.
 * Alerts whose newest observation is older than STALE_HOURS expire.
 */
export const ALERT_RULES = {
  CELL_DEG: 0.5,
  HIGH_CLUSTER: 25,
  HIGH_CONF: 5,
  INFO_CLUSTER: 5,
  FRESH_HOURS: 24,
  STALE_HOURS: 72,
} as const;

export type Severity = "critical" | "high" | "moderate" | "info";
export type AlertKind = "observational" | "statistical" | "official";
export const SEVERITY_RANK: Record<Severity, number> = { info: 0, moderate: 1, high: 2, critical: 3 };

export interface FireAlert {
  id: string;
  severity: Severity;
  kind: AlertKind;
  simulated: boolean;
  country: string;
  lat: number;
  lon: number;
  cell: { lat0: number; lon0: number; size: number };
  observedAt: string; // ISO UTC of newest detection in the cell
  ageHours: number;
  source: string;
  detections: number;
  cellDetections: number;
  highConfidence: number;
  title: string;
  reason: string;
  uncertainty: string;
  action: string;
}

export const obsTime = (r: Detection) => `${r.date}T${r.time.padStart(4, "0").slice(0, 2)}:${r.time.padStart(4, "0").slice(2)}:00Z`;

export function computeAlerts(opts: {
  records: Detection[];
  anomalies: Map<string, AnomalyResult>;
  sourceLabel: string;
  simulated: boolean;
  now: number;
}): { alerts: FireAlert[]; expired: number } {
  const R = ALERT_RULES;
  const byCountry = new Map<string, Detection[]>();
  for (const r of opts.records) {
    if (!r.country) continue;
    let a = byCountry.get(r.country);
    if (!a) byCountry.set(r.country, (a = []));
    a.push(r);
  }
  const alerts: FireAlert[] = [];
  let expired = 0;
  for (const [country, rs] of byCountry) {
    // densest 0.5° cell, counting only nominal/high confidence detections
    const cells = new Map<string, Detection[]>();
    for (const r of rs) {
      if (r.confidenceLevel !== "nominal" && r.confidenceLevel !== "high") continue;
      const k = `${Math.floor(r.lat / R.CELL_DEG)}:${Math.floor(r.lon / R.CELL_DEG)}`;
      let a = cells.get(k);
      if (!a) cells.set(k, (a = []));
      a.push(r);
    }
    const an = opts.anomalies.get(country);
    const anomalous = an && (an.status === "elevated" || an.status === "strong");
    let best: Detection[] = [];
    for (const c of cells.values()) if (c.length > best.length) best = c;
    if (!best.length || (best.length < R.INFO_CLUSTER && !anomalous)) continue;
    const newest = best.reduce((m, r) => (obsTime(r) > obsTime(m) ? r : m));
    const observedAt = obsTime(newest);
    const ageHours = (opts.now - Date.parse(observedAt)) / 3.6e6;
    if (ageHours > R.STALE_HOURS) {
      expired++;
      continue;
    }
    const fresh = ageHours <= R.FRESH_HOURS;
    const high = best.filter((r) => r.confidenceLevel === "high").length;
    const lat = best.reduce((s, r) => s + r.lat, 0) / best.length;
    const lon = best.reduce((s, r) => s + r.lon, 0) / best.length;
    let severity: Severity = "info";
    let kind: AlertKind = "observational";
    let reason = `${best.length} nominal/high-confidence detections in one ${R.CELL_DEG}° cell (≥ ${R.INFO_CLUSTER} required).`;
    let title = "New fire activity observed";
    if (best.length >= R.HIGH_CLUSTER && high >= R.HIGH_CONF && fresh) {
      severity = "high";
      title = "Concentrated fire activity detected";
      reason = `${best.length} detections (${high} high-confidence) clustered in one ${R.CELL_DEG}° cell, newest ${ageHours.toFixed(0)} h ago (rule: ≥ ${R.HIGH_CLUSTER} detections, ≥ ${R.HIGH_CONF} high-confidence, ≤ ${R.FRESH_HOURS} h old).`;
    } else if (anomalous && an) {
      kind = "statistical";
      severity = an.status === "strong" && fresh ? "high" : "moderate";
      title = "Activity above historical baseline";
      reason = `${an.observed} detections vs a trailing baseline mean of ${an.baselineMean?.toFixed(1)} (z = ${an.z?.toFixed(2)}, ${an.validWindows} baseline windows).${severity === "high" ? " Strong anomaly with fresh observations." : ""}`;
    }
    alerts.push({
      id: `${country}|${kind}`,
      severity,
      kind,
      simulated: opts.simulated,
      country,
      lat,
      lon,
      cell: { lat0: Math.floor(lat / R.CELL_DEG) * R.CELL_DEG, lon0: Math.floor(lon / R.CELL_DEG) * R.CELL_DEG, size: R.CELL_DEG },
      observedAt,
      ageHours,
      source: opts.sourceLabel,
      detections: rs.length,
      cellDetections: best.length,
      highConfidence: high,
      title: opts.simulated ? `SIMULATED · ${title}` : title,
      reason,
      uncertainty:
        "Satellite thermal-anomaly detections are not confirmed fires; industrial heat, gas flares or clouds may cause false positives and small/obscured fires may be missed. Hotspot coordinates are pixel centres, not fire perimeters.",
      action:
        severity === "high"
          ? "Verify conditions on the ground and consult the relevant emergency authority."
          : severity === "moderate"
            ? "Review recent overpasses and official agency bulletins."
            : "Continue routine monitoring.",
    });
  }
  alerts.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.cellDetections - a.cellDetections);
  return { alerts, expired };
}

/** Alerts that should notify: above the preference threshold, not dismissed at this or higher severity. */
export function notifiable(alerts: FireAlert[], dismissed: Record<string, Severity>, minSeverity: Severity, country: string | null) {
  return alerts.filter(
    (a) =>
      SEVERITY_RANK[a.severity] >= SEVERITY_RANK[minSeverity] &&
      (!country || a.country === country) &&
      !(dismissed[a.id] && SEVERITY_RANK[dismissed[a.id]!] >= SEVERITY_RANK[a.severity]),
  );
}
