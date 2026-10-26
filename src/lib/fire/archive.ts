/**
 * Long-term NASA FIRMS country archive (yearly per-country CSVs, MODIS 2000–, VIIRS S-NPP 2012–).
 * Pure helpers: summarizing CSVs into daily aggregates, harmonized metrics, baselines and anomalies.
 */
export const ARCHIVE_SENSORS = {
  modis: {
    label: "MODIS Terra/Aqua (MCD14 C6.1)",
    short: "MODIS",
    firstYear: 2000,
    resolution: "1 km",
    overpasses: "≈4 per day (Terra ~10:30/22:30, Aqua ~13:30/01:30 local)",
  },
  "viirs-snpp": {
    label: "VIIRS S-NPP (VNP14IMG)",
    short: "VIIRS S-NPP",
    firstYear: 2012,
    resolution: "375 m",
    overpasses: "≈2 per day (~13:30/01:30 local)",
  },
} as const;
export type ArchiveSensor = keyof typeof ARCHIVE_SENSORS;
export const ARCHIVE_LAST_YEAR = 2025; // last complete year published as yearly country files (verified 2026-10-25)

/** Harmonization grid: both sensors collapse onto the same 0.05° (~5 km) cells per UTC day. */
export const HARMONIZE_GRID_DEG = 0.05;

/** Natural Earth (map) names → FIRMS archive file names, where they differ. */
const FIRMS_NAME: Record<string, string> = {
  "United States of America": "United_States",
  "Dem. Rep. Congo": "Democratic_Republic_of_the_Congo",
  "Central African Rep.": "Central_African_Republic",
  "S. Sudan": "South_Sudan",
  Russia: "Russian_Federation",
  Czechia: "Czech_Republic",
  "Bosnia and Herz.": "Bosnia_and_Herzegovina",
  "Dominican Rep.": "Dominican_Republic",
  "Eq. Guinea": "Equatorial_Guinea",
  eSwatini: "Swaziland",
  "Solomon Is.": "Solomon_Islands",
};
export const firmsCountryName = (name: string) => FIRMS_NAME[name] ?? name.replace(/\s+/g, "_");

/** Per day: [all rows, vegetation-fire rows (type 0, nominal+ confidence), harmonized 0.05° cells]. */
export type DayAgg = [number, number, number];
export interface YearSummary {
  days: Record<string, DayAgg>;
  rows: number;
  malformed: number;
  /** rows whose acq_date falls outside the requested year (mislabelled file guard) */
  wrongYear?: number;
}

export function isConfident(conf: string) {
  const v = conf.trim().toLowerCase();
  if (v === "n" || v === "h" || v === "nominal" || v === "high") return true;
  const n = Number(v);
  return v !== "" && Number.isFinite(n) && n >= 30;
}

export function summarizeArchiveCsv(text: string, expectYear?: number): YearSummary {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((h) => h.trim());
  const iLat = header.indexOf("latitude"), iLon = header.indexOf("longitude"), iDate = header.indexOf("acq_date");
  const iConf = header.indexOf("confidence"), iType = header.indexOf("type");
  if (iLat < 0 || iLon < 0 || iDate < 0) throw new Error("Unexpected FIRMS archive format");
  const days: Record<string, DayAgg> = {};
  const cells = new Map<string, Set<string>>();
  let rows = 0, malformed = 0, wrongYear = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split(",");
    const lat = Number(c[iLat]), lon = Number(c[iLon]), d = c[iDate] ?? "";
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      malformed++;
      continue;
    }
    if (expectYear != null && Number(d.slice(0, 4)) !== expectYear) {
      wrongYear++;
      continue;
    }
    rows++;
    const a = (days[d] ??= [0, 0, 0]);
    a[0]++;
    const type = iType >= 0 ? (c[iType] ?? "").trim() : "0";
    if ((type === "0" || type === "") && isConfident(iConf >= 0 ? c[iConf] ?? "" : "")) {
      a[1]++;
      let s = cells.get(d);
      if (!s) cells.set(d, (s = new Set()));
      s.add(`${Math.floor(lat / HARMONIZE_GRID_DEG)}:${Math.floor(lon / HARMONIZE_GRID_DEG)}`);
    }
  }
  for (const [d, s] of cells) days[d]![2] = s.size;
  return { days, rows, malformed, wrongYear };
}

export type Metric = 0 | 1 | 2;
export const METRIC_LABELS: Record<Metric, string> = {
  0: "Raw detections (all rows)",
  1: "Vegetation-fire detections",
  2: "Harmonized fire-active cells",
};

export type YearState =
  | { status: "loading" | "pending" }
  | { status: "ok"; summary: YearSummary }
  | { status: "unavailable" | "error" | "invalid"; message: string };

/** Validation of a summarized year: rejects mislabelled files and files that are mostly malformed. */
export function validateYear(s: YearSummary): { ok: true } | { ok: false; message: string } {
  const total = s.rows + s.malformed + (s.wrongYear ?? 0);
  if ((s.wrongYear ?? 0) > 0.05 * Math.max(1, total)) return { ok: false, message: `${s.wrongYear} rows dated outside the requested year — file appears mislabelled.` };
  if (s.malformed > 0.05 * Math.max(1, total)) return { ok: false, message: `${s.malformed} of ${total} rows malformed — file treated as corrupt.` };
  return { ok: true };
}

/** Coverage ladder for the interface: listed → archive exists → downloaded → validated → usable for statistics. */
export function yearLadder(st: YearState | undefined) {
  const s = st?.status;
  return {
    exists: s === "ok" || s === "invalid" ? true : s === "unavailable" ? false : null,
    downloaded: s === "ok" || s === "invalid",
    validated: s === "ok",
    usable: st?.status === "ok" && st.summary.rows > 0,
  };
}

/** year → month(0-11) → metric total, only for retrieved years. */
export function monthlyMatrix(years: Record<number, YearState>, metric: Metric) {
  const out = new Map<number, number[]>();
  for (const [y, st] of Object.entries(years)) {
    if (st.status !== "ok") continue;
    const m = Array(12).fill(0) as number[];
    for (const [d, a] of Object.entries(st.summary.days)) m[Number(d.slice(5, 7)) - 1]! += a[metric];
    out.set(Number(y), m);
  }
  return out;
}

export interface MonthAnomaly {
  status: "insufficient" | "normal" | "elevated" | "strong" | "low";
  observed: number;
  baselineMean: number | null;
  baselineSd: number | null;
  baselineYears: number[];
  z: number | null;
  ratio: number | null;
  reason: string;
}

/** Same-month baseline across other retrieved years. Needs ≥ minYears baseline years. */
export function monthAnomaly(matrix: Map<number, number[]>, year: number, month: number, minYears = 10, zFlag = 2, zStrong = 3): MonthAnomaly {
  const observed = matrix.get(year)?.[month] ?? 0;
  const baselineYears = [...matrix.keys()].filter((y) => y !== year).sort();
  const vals = baselineYears.map((y) => matrix.get(y)![month]!);
  if (!matrix.has(year) || vals.length < minYears)
    return { status: "insufficient", observed, baselineMean: null, baselineSd: null, baselineYears, z: null, ratio: null, reason: `Insufficient historical data: ${vals.length} comparison year(s) retrieved; ${minYears} required.` };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
  const z = sd > 0 ? (observed - mean) / sd : observed > mean ? Infinity : 0;
  const ratio = mean > 0 ? observed / mean : null;
  const big = observed >= 1.5 * mean && observed >= 10;
  const status = z >= zStrong && big ? "strong" : z >= zFlag && big ? "elevated" : z <= -zFlag ? "low" : "normal";
  const reason =
    status === "strong" || status === "elevated"
      ? `${observed} vs ${vals.length}-year same-month mean ${mean.toFixed(0)} (z = ${z.toFixed(1)}, ${ratio?.toFixed(1)}×). Flagged because z ≥ ${status === "strong" ? zStrong : zFlag} and the value is ≥ 1.5× the baseline.`
      : status === "low"
        ? `Well below the ${vals.length}-year same-month mean (z = ${z.toFixed(1)}).`
        : `Within the normal range of the ${vals.length}-year same-month baseline (z = ${z.toFixed(1)}).`;
  return { status, observed, baselineMean: mean, baselineSd: sd, baselineYears, z, ratio, reason };
}

/** Months that recur as the peak fire season: climatological mean ≥ 1.5× the average month AND top-3 month in ≥ 50% of years. */
export function recurringPeakMonths(matrix: Map<number, number[]>, minYears = 5) {
  const years = [...matrix.keys()];
  if (years.length < minYears) return null;
  const means = Array.from({ length: 12 }, (_, m) => years.reduce((a, y) => a + matrix.get(y)![m]!, 0) / years.length);
  const avg = means.reduce((a, b) => a + b, 0) / 12;
  const top3 = Array(12).fill(0) as number[];
  for (const y of years) {
    const row = matrix.get(y)!;
    if (row.every((v) => v === 0)) continue;
    [...row.keys()].sort((a, b) => row[b]! - row[a]!).slice(0, 3).forEach((m) => top3[m]!++);
  }
  return means
    .map((mean, m) => ({ month: m, mean, share: top3[m]! / years.length, ratio: avg > 0 ? mean / avg : 0 }))
    .filter((r) => r.ratio >= 1.5 && r.share >= 0.5)
    .sort((a, b) => b.mean - a.mean);
}

/** VIIRS ÷ MODIS ratio of harmonized cells for overlap years (documented, not used to rescale). */
export function crossSensorRatio(a: Map<number, number[]>, b: Map<number, number[]>) {
  const rows: { year: number; modis: number; viirs: number; ratio: number | null }[] = [];
  for (const [y, m] of a) {
    const v = b.get(y);
    if (!v) continue;
    const ms = m.reduce((s, x) => s + x, 0), vs = v.reduce((s, x) => s + x, 0);
    rows.push({ year: y, modis: ms, viirs: vs, ratio: ms > 0 ? vs / ms : null });
  }
  return rows.sort((p, q) => p.year - q.year);
}
