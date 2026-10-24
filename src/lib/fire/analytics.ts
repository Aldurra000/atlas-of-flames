import type { Cell, Detection } from "./types";
import { addDays } from "./dates";

export const ALL = "__ALL__";

/** country → date → count (plus ALL key) */
export function buildDailyIndex(records: Detection[]) {
  const idx = new Map<string, Map<string, number>>();
  const bump = (k: string, d: string) => {
    let m = idx.get(k);
    if (!m) idx.set(k, (m = new Map()));
    m.set(d, (m.get(d) ?? 0) + 1);
  };
  for (const r of records) {
    bump(ALL, r.date);
    bump(r.country ?? "Unassigned", r.date);
  }
  return idx;
}

export function groupByDate(records: Detection[]) {
  const m = new Map<string, Detection[]>();
  for (const r of records) {
    let a = m.get(r.date);
    if (!a) m.set(r.date, (a = []));
    a.push(r);
  }
  return m;
}

export function windowDates(end: string, windowDays: number) {
  return Array.from({ length: windowDays }, (_, i) => addDays(end, -(windowDays - 1 - i)));
}

export function aggregateCells(records: Detection[], size: number): Cell[] {
  const m = new Map<string, Cell & { _p: Set<string>; _c: Set<string>; _lat: number; _lon: number }>();
  for (const r of records) {
    const lat0 = Math.floor(r.lat / size) * size;
    const lon0 = Math.floor(r.lon / size) * size;
    const key = `${lat0}:${lon0}`;
    let c = m.get(key);
    if (!c) {
      c = { key, lat0, lon0, size, lat: 0, lon: 0, count: 0, maxFrp: null, sumFrp: 0, products: [], countries: [], first: r, _p: new Set(), _c: new Set(), _lat: 0, _lon: 0 };
      m.set(key, c);
    }
    c.count++;
    c._lat += r.lat;
    c._lon += r.lon;
    if (r.frp != null) {
      c.sumFrp += r.frp;
      c.maxFrp = Math.max(c.maxFrp ?? 0, r.frp);
    }
    c._p.add(r.instrument ? `${r.instrument}${r.satellite ? ` (${r.satellite})` : ""}` : r.source);
    if (r.country) c._c.add(r.country);
  }
  return [...m.values()].map(({ _p, _c, _lat, _lon, ...c }) => ({
    ...c,
    lat: _lat / c.count,
    lon: _lon / c.count,
    products: [..._p],
    countries: [..._c],
  }));
}

export interface AnomalyConfig {
  zThreshold: number;
  strongZ: number;
  minCount: number;
  baselineWindows: number;
  minValidWindows: number;
  minCoverage: number;
}
export const DEFAULT_ANOMALY: AnomalyConfig = {
  zThreshold: 2,
  strongZ: 3,
  minCount: 10,
  baselineWindows: 8,
  minValidWindows: 4,
  minCoverage: 0.8,
};

export type AnomalyStatus = "insufficient" | "normal" | "elevated" | "strong";
export interface AnomalyResult {
  status: AnomalyStatus;
  observed: number;
  coverage: number;
  baselineMean: number | null;
  baselineStd: number | null;
  z: number | null;
  ratio: number | null;
  validWindows: number;
  reason: string;
}

/**
 * Trailing-baseline anomaly test.
 * Observed = detections in [end-W+1, end]. Baseline = the K preceding, non-overlapping
 * windows of the same length. Windows below `minCoverage` of available days are dropped;
 * partial windows are scaled to full length. z = (obs − mean) / max(std, √mean, 1)
 * (a Poisson floor, so low-count regions are not flagged by noise).
 */
export function computeAnomaly(
  daily: Map<string, number> | undefined,
  available: Set<string>,
  end: string,
  W: number,
  cfg: AnomalyConfig = DEFAULT_ANOMALY,
): AnomalyResult {
  const sumWindow = (e: string) => {
    let s = 0, a = 0;
    for (const d of windowDates(e, W)) {
      if (available.has(d)) {
        a++;
        s += daily?.get(d) ?? 0;
      }
    }
    return { cov: a / W, value: a ? (s * W) / a : 0, rawSum: s };
  };
  const obs = sumWindow(end);
  const base: number[] = [];
  for (let k = 1; k <= cfg.baselineWindows; k++) {
    const w = sumWindow(addDays(end, -k * W));
    if (w.cov >= cfg.minCoverage) base.push(w.value);
  }
  const res: AnomalyResult = {
    status: "insufficient",
    observed: obs.rawSum,
    coverage: obs.cov,
    baselineMean: null,
    baselineStd: null,
    z: null,
    ratio: null,
    validWindows: base.length,
    reason: "",
  };
  const windowStart = addDays(end, -(W - 1));
  const priorDays = [...available].filter((d) => d < windowStart).length;
  if (priorDays < 28) {
    res.reason = `Insufficient historical data: ${priorDays} preceding observed days; at least 28 are required. Short ranges cannot establish annual seasonality or forecasts.`;
    return res;
  }
  if (obs.cov < cfg.minCoverage) {
    res.reason = `Only ${Math.round(obs.cov * 100)}% of the selected window has observations.`;
    return res;
  }
  if (base.length < cfg.minValidWindows) {
    res.reason = `Insufficient historical data: ${base.length} of ${cfg.minValidWindows} required baseline windows available.`;
    return res;
  }
  const mean = base.reduce((a, b) => a + b, 0) / base.length;
  const std = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length);
  const denom = Math.max(std, Math.sqrt(mean), 1);
  const z = (obs.value - mean) / denom;
  res.baselineMean = mean;
  res.baselineStd = std;
  res.z = z;
  res.ratio = mean > 0 ? obs.value / mean : null;
  if (obs.rawSum >= cfg.minCount && z >= cfg.strongZ) res.status = "strong";
  else if (obs.rawSum >= cfg.minCount && z >= cfg.zThreshold) res.status = "elevated";
  else res.status = "normal";
  res.reason =
    res.status === "normal"
      ? `Observed count is within ${cfg.zThreshold} standard deviations of the ${base.length}-window baseline.`
      : `Observed ${obs.rawSum} detections vs a baseline mean of ${mean.toFixed(1)} (z = ${z.toFixed(2)} ≥ ${res.status === "strong" ? cfg.strongZ : cfg.zThreshold}) across the ${base.length} preceding ${W}-day windows.`;
  return res;
}

export interface Priority {
  country: string;
  score: number;
  level: "High" | "Medium" | "Low";
  recent: number;
  persistence: number;
  anomaly: AnomalyResult;
  components: { recent: number; persistence: number; anomaly: number };
  reasons: string[];
  action: string;
}

/**
 * Monitoring Priority Assessment (not a forecast).
 * score = 0.4·R + 0.3·P + 0.3·A where
 *   R = log(1+recent) / log(1+max recent across regions)
 *   P = fraction of available window days with ≥1 detection
 *   A = clamp(z / 4, 0, 1), or 0 when the baseline is insufficient
 * High ≥ 0.6, Medium ≥ 0.35.
 */
export function computePriorities(
  idx: Map<string, Map<string, number>>,
  available: Set<string>,
  end: string,
  W: number,
  cfg: AnomalyConfig = DEFAULT_ANOMALY,
): Priority[] {
  const days = windowDates(end, W).filter((d) => available.has(d));
  const rows: Omit<Priority, "score" | "level" | "components" | "action">[] = [];
  for (const [country, daily] of idx) {
    if (country === ALL || country === "Unassigned") continue;
    const recent = days.reduce((s, d) => s + (daily.get(d) ?? 0), 0);
    if (!recent) continue;
    const persistence = days.length ? days.filter((d) => (daily.get(d) ?? 0) > 0).length / days.length : 0;
    rows.push({ country, recent, persistence, anomaly: computeAnomaly(daily, available, end, W, cfg), reasons: [] });
  }
  const maxR = Math.max(1, ...rows.map((r) => r.recent));
  return rows
    .map((r) => {
      const R = Math.log1p(r.recent) / Math.log1p(maxR);
      const A = r.anomaly.z != null ? Math.min(1, Math.max(0, r.anomaly.z / 4)) : 0;
      const score = 0.4 * R + 0.3 * r.persistence + 0.3 * A;
      const level: Priority["level"] = score >= 0.6 ? "High" : score >= 0.35 ? "Medium" : "Low";
      const reasons = [`${r.recent.toLocaleString()} detections in the last ${W} day(s)`];
      if (r.persistence >= 0.7) reasons.push(`activity observed on ${Math.round(r.persistence * 100)}% of available days`);
      if (r.anomaly.status === "elevated" || r.anomaly.status === "strong")
        reasons.push(`${r.anomaly.ratio ? `${r.anomaly.ratio.toFixed(1)}×` : "above"} the trailing baseline`);
      if (r.anomaly.status === "insufficient") reasons.push("no reliable historical baseline");
      const action =
        level === "High"
          ? "Review latest overpasses daily; cross-check with national agency bulletins."
          : level === "Medium"
            ? "Check activity trend at each new data refresh."
            : "Routine monitoring.";
      return { ...r, score, level, components: { recent: R, persistence: r.persistence, anomaly: A }, reasons, action };
    })
    .sort((a, b) => b.score - a.score);
}
