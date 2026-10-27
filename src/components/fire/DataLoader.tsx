import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useFire } from "@/lib/fire/store";
import { generateDemoDataset } from "@/lib/fire/demo";
import { fetchFirms, getFirmsStatus } from "@/lib/fire/firms.functions";
import { countryAt } from "@/lib/fire/geo";
import { addDays, dateRange, todayUtc } from "@/lib/fire/dates";
import { parseFirmsCsv } from "@/lib/fire/firms";
import type { Detection } from "@/lib/fire/types";

/** Loads the active dataset (demo or live FIRMS) into the shared store. Never mixes the two. */
export function DataLoader() {
  const mode = useFire((s) => s.mode);
  const live = useFire((s) => s.live);
  const status = useServerFn(getFirmsStatus);
  const fetchLive = useServerFn(fetchFirms);
  const refreshNonce = useFire((s) => s.refreshNonce);
  const refreshMinutes = useFire((s) => s.refreshMinutes);
  const pending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (mode !== "live" || refreshMinutes <= 0) return;
    const timer = setInterval(() => useFire.getState().requestRefresh(), refreshMinutes * 60_000);
    return () => clearInterval(timer);
  }, [mode, refreshMinutes]);

  useEffect(() => {
    status()
      .then((r) => useFire.getState().set({ liveConfigured: r.configured }))
      .catch(() => useFire.getState().set({ liveConfigured: false }));
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    const s = useFire.getState();
    const previous = mode === "live" && s.data?.ds.kind === "live" ? s.data : null;
    s.set({ status: previous ? "ready" : "loading", error: null, refreshError: null, refreshing: mode === "live" });
    if (mode === "demo") {
      s.set({ refreshing: false });
      setTimeout(() => !cancelled && useFire.getState().setDataset(generateDemoDataset(todayUtc())), 0);
      return () => void (cancelled = true);
    }
    const load = async () => {
      if (cancelled) return;
      const end = live.endDate ?? todayUtc();
      const dates = dateRange(addDays(end, -(live.days - 1)), end);
      const records: Detection[] = [];
      const missingDates: string[] = [];
      const notes: string[] = [];
      const dailyCounts: Record<string, { returned: number; loaded: number }> = {};
      let returnedRecordCount = 0;
      let truncated = false;
      let fetchedAt = "";
      for (const date of dates) {
        const r = await fetchLive({ data: { source: live.source, region: live.region, endDate: date, days: 1 } });
        if (cancelled) return;
        if (!r.ok) {
          missingDates.push(date);
          notes.push(r.error);
          continue;
        }
        for (const csv of r.csvChunks) {
          for (const rec of parseFirmsCsv(csv, live.source)) {
            rec.country = countryAt(rec.lat, rec.lon);
            records.push(rec);
          }
        }
        returnedRecordCount += r.returnedRecordCount;
        Object.assign(dailyCounts, r.dailyCounts);
        notes.push(...r.notes);
        truncated ||= r.truncated;
        fetchedAt = r.fetchedAt;
      }
      if (cancelled) return;
      if (missingDates.length === dates.length || previous && (missingDates.length > 0 || truncated)) {
        const error = notes.join(" ") || "NASA observations unavailable.";
        useFire.getState().set(previous
          ? { status: "ready", refreshError: `Refresh incomplete. Previous observations retained. ${error}` }
          : { status: "error", error });
        return;
      }
      useFire.getState().setDataset({
          kind: "live",
          source: live.source,
          region: live.region,
          records,
          returnedRecordCount,
          dailyCounts,
          dates,
          missingDates,
          fetchedAt,
          truncated,
          notes: [...new Set(notes)],
         }, Boolean(previous));
    };
    // Serialize even across configuration changes; obsolete responses are never committed.
    pending.current = pending.current.then(load).catch(() => {
      if (!cancelled) useFire.getState().set(previous
        ? { status: "ready", refreshError: "Refresh failed. Previous observations retained; NASA proxy could not be reached." }
        : { status: "error", error: "Could not reach the FIRMS proxy. No observations are shown." });
    }).finally(() => {
      if (!cancelled) useFire.getState().set({ refreshing: false });
    });
    return () => void (cancelled = true);
  }, [mode, live, fetchLive, refreshNonce]);

  return null;
}
