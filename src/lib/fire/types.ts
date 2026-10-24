/**
 * FIRECHRONICLE normalized detection schema.
 *
 * Every satellite active-fire detection (one FIRMS CSV row) is normalized into
 * a `Detection`. The original CSV fields are preserved untouched in `raw`.
 * A Detection is ONE satellite observation of a thermal anomaly pixel — it is
 * not a unique physical fire and not burned area.
 */
export const LIVE_SOURCES = [
  "VIIRS_SNPP_NRT",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA21_NRT",
  "MODIS_NRT",
  "VIIRS_SNPP_SP",
  "VIIRS_NOAA20_SP",
  "MODIS_SP",
] as const;
export type LiveSource = (typeof LIVE_SOURCES)[number];
export type FireSource = LiveSource | "DEMO_SYNTHETIC";

export const SOURCE_LABELS: Record<FireSource, string> = {
  VIIRS_SNPP_NRT: "VIIRS S-NPP 375 m · Near Real-Time",
  VIIRS_NOAA20_NRT: "VIIRS NOAA-20 375 m · Near Real-Time",
  VIIRS_NOAA21_NRT: "VIIRS NOAA-21 375 m · Near Real-Time",
  MODIS_NRT: "MODIS Terra/Aqua 1 km · Near Real-Time",
  VIIRS_SNPP_SP: "VIIRS S-NPP 375 m · Standard (archive)",
  VIIRS_NOAA20_SP: "VIIRS NOAA-20 375 m · Standard (archive)",
  MODIS_SP: "MODIS Terra/Aqua 1 km · Standard (archive)",
  DEMO_SYNTHETIC: "Synthetic demonstration records",
};

export type ConfidenceLevel = "low" | "nominal" | "high" | "unknown";

export interface Detection {
  id: string;
  lat: number;
  lon: number;
  /** YYYY-MM-DD (UTC) */
  date: string;
  /** HHMM (UTC) */
  time: string;
  source: FireSource;
  satellite: string | null;
  instrument: string | null;
  /** Original confidence value as reported (VIIRS: l/n/h, MODIS: 0–100) */
  confidence: string | null;
  confidenceLevel: ConfidenceLevel;
  /** Kelvin. VIIRS bright_ti4 / MODIS brightness */
  brightness: number | null;
  /** Kelvin. VIIRS bright_ti5 / MODIS bright_t31 */
  brightness2: number | null;
  /** Fire Radiative Power, MW */
  frp: number | null;
  daynight: "D" | "N" | null;
  scan: number | null;
  track: number | null;
  version: string | null;
  /** Country assigned by point-in-polygon against Natural Earth 1:110m boundaries */
  country: string | null;
  isDemo: boolean;
  raw: Record<string, string>;
}

export interface Dataset {
  kind: "demo" | "live";
  source: FireSource;
  region: string;
  records: Detection[];
  /** every date in the requested range, sorted */
  dates: string[];
  /** dates in range for which no observations could be obtained (not the same as zero detections) */
  missingDates: string[];
  fetchedAt: string;
  /** CSV data rows returned on successfully retrieved dates, before validation. */
  returnedRecordCount?: number;
  dailyCounts?: Record<string, { returned: number; loaded: number }>;
  truncated: boolean;
  notes: string[];
}

export interface Cell {
  key: string;
  lat0: number;
  lon0: number;
  size: number;
  lat: number;
  lon: number;
  count: number;
  maxFrp: number | null;
  sumFrp: number;
  products: string[];
  countries: string[];
  first: Detection;
}
