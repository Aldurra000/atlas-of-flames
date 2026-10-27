import { create } from "zustand";
import { useMemo } from "react";
import type { Cell, Dataset, Detection, LiveSource } from "./types";
import type { ArchiveSensor, YearState } from "./archive";
import { ALL, buildDailyIndex, DEFAULT_ANOMALY, groupByDate, windowDates, type AnomalyConfig } from "./analytics";

export type Viz = "flames" | "columns" | "heat" | "clusters";
export type Selection = { type: "detection"; detection: Detection } | { type: "cell"; cell: Cell } | null;
export type ZoomBucket = "far" | "mid" | "near";

export interface Prepared {
  ds: Dataset;
  byDate: Map<string, Detection[]>;
  idx: Map<string, Map<string, number>>;
  available: Set<string>;
  missing: Set<string>;
}

interface FireState {
  mode: "demo" | "live";
  liveConfigured: boolean | null;
  live: { source: LiveSource; region: string; endDate: string | null; days: number };
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  refreshing: boolean;
  refreshError: string | null;
  refreshMinutes: number;
  refreshNonce: number;
  requestRefresh: () => void;
  data: Prepared | null;
  selectedDate: string | null;
  windowDays: number;
  playing: boolean;
  speed: number;
  viz: Viz;
  country: string | null;
  filters: { daynight: "all" | "D" | "N"; minConfidence: "all" | "nominal" | "high"; minFrp: number };
  selection: Selection;
  focus: { lat: number; lon: number; dist: number; reset?: boolean } | null;
  autoRotate: boolean;
  zoomBucket: ZoomBucket;
  anomaly: AnomalyConfig;
  /** Long-term per-country NASA archive (independent of the live/demo dataset). */
  archive: { country: string | null; years: Record<ArchiveSensor, Record<number, YearState>> };
  setArchiveYear: (country: string, sensor: ArchiveSensor, year: number, st: YearState) => void;
  set: (p: Partial<FireState>) => void;
  setDataset: (ds: Dataset, preserveSelection?: boolean) => void;
}

export const useFire = create<FireState>((set) => ({
  mode: "live",
  liveConfigured: null,
  live: { source: "VIIRS_SNPP_NRT", region: "world", endDate: null, days: 7 },
  status: "idle",
  error: null,
  refreshing: false,
  refreshError: null,
  refreshMinutes: 30,
  refreshNonce: 0,
  requestRefresh: () => set((s) => s.refreshing ? {} : { refreshNonce: s.refreshNonce + 1 }),
  data: null,
  selectedDate: null,
  windowDays: 7,
  playing: false,
  speed: 1,
  viz: "flames",
  country: null,
  filters: { daynight: "all", minConfidence: "all", minFrp: 0 },
  selection: null,
  focus: null,
  autoRotate: true,
  zoomBucket: "far",
  anomaly: DEFAULT_ANOMALY,
  archive: { country: null, years: { modis: {}, "viirs-snpp": {} } },
  setArchiveYear: (country, sensor, year, st) =>
    set((s) => {
      const base = s.archive.country === country ? s.archive.years : { modis: {}, "viirs-snpp": {} };
      return { archive: { country, years: { ...base, [sensor]: { ...base[sensor], [year]: st } } } };
    }),
  set: (p) => set((s) => ({
    ...p,
    ...(p.mode && p.mode !== s.mode || p.live && p.live !== s.live
      ? { data: null, selection: null, playing: false, status: "loading" as const, error: null, refreshError: null }
      : p.country !== undefined || p.filters || p.selectedDate || p.windowDays
        ? { selection: null } : {}),
  })),
  setDataset: (ds, preserveSelection = false) => {
    const missing = new Set(ds.missingDates);
    const data: Prepared = {
      ds,
      byDate: groupByDate(ds.records),
      idx: buildDailyIndex(ds.records),
      missing,
      available: new Set(ds.dates.filter((d) => !missing.has(d))),
    };
    const last = ds.dates[ds.dates.length - 1] ?? null;
    set((s) => ({
      data,
      status: "ready",
      error: null,
      refreshError: null,
      selectedDate: preserveSelection && s.selectedDate && ds.dates.includes(s.selectedDate) ? s.selectedDate : last,
      windowDays: s.windowDays <= ds.dates.length ? s.windowDays : ds.dates.length >= 7 ? 7 : 1,
      selection: null,
      playing: preserveSelection ? s.playing : false,
    }));
  },
}));

const CONF_RANK = { unknown: 0, low: 1, nominal: 2, high: 3 } as const;

export function passesFilters(r: Detection, f: FireState["filters"]) {
  if (f.daynight !== "all" && r.daynight !== f.daynight) return false;
  if (f.minConfidence !== "all" && CONF_RANK[r.confidenceLevel] < CONF_RANK[f.minConfidence]) return false;
  if (f.minFrp > 0 && (r.frp ?? 0) < f.minFrp) return false;
  return true;
}

/** Detections in the selected time window, honoring country + attribute filters. */
export function useWindowData(opts: { ignoreCountry?: boolean } = {}) {
  const data = useFire((s) => s.data);
  const date = useFire((s) => s.selectedDate);
  const W = useFire((s) => s.windowDays);
  const country = useFire((s) => s.country);
  const filters = useFire((s) => s.filters);
  return useMemo(() => {
    if (!data || !date) return null;
    const dates = windowDates(date, W);
    const avail = dates.filter((d) => data.available.has(d));
    const missing = dates.filter((d) => data.missing.has(d) || !data.ds.dates.includes(d));
    const records: Detection[] = [];
    for (const d of avail) {
      for (const r of data.byDate.get(d) ?? []) {
        if (!opts.ignoreCountry && country && r.country !== country) continue;
        if (passesFilters(r, filters)) records.push(r);
      }
    }
    const byCountry = new Map<string, number>();
    for (const r of records) byCountry.set(r.country ?? "Unassigned", (byCountry.get(r.country ?? "Unassigned") ?? 0) + 1);
    return { dates, avail, missing, records, byCountry, coverage: avail.length / W };
  }, [data, date, W, country, filters, opts.ignoreCountry]);
}

export const scopeKey = (country: string | null) => country ?? ALL;

/** Attribute filters also apply to historical counts; country scoping is applied by each view. */
export function useFilteredData() {
  const data = useFire((s) => s.data);
  const filters = useFire((s) => s.filters);
  return useMemo(() => {
    if (!data) return null;
    const records = data.ds.records.filter((r) => passesFilters(r, filters));
    return { ...data, idx: buildDailyIndex(records), byDate: groupByDate(records) };
  }, [data, filters]);
}

export function analyticsAvailability(data: Prepared) {
  return data.ds.truncated ? new Set<string>() : data.available;
}
