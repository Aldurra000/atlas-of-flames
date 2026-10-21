import { create } from "zustand";
import { useMemo } from "react";
import type { Cell, Dataset, Detection, LiveSource } from "./types";
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
  set: (p: Partial<FireState>) => void;
  setDataset: (ds: Dataset) => void;
}

export const useFire = create<FireState>((set) => ({
  mode: "demo",
  liveConfigured: null,
  live: { source: "VIIRS_SNPP_NRT", region: "world", endDate: null, days: 1 },
  status: "idle",
  error: null,
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
  set: (p) => set(p),
  setDataset: (ds) => {
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
      selectedDate: last,
      windowDays: Math.min(s.windowDays, ds.dates.length >= 7 ? s.windowDays : 1),
      selection: null,
      playing: false,
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
