import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useFire } from "@/lib/fire/store";
import { generateDemoDataset } from "@/lib/fire/demo";
import { fetchFirms, getFirmsStatus } from "@/lib/fire/firms.functions";
import { countryAt } from "@/lib/fire/geo";
import { todayUtc } from "@/lib/fire/dates";

/** Loads the active dataset (demo or live FIRMS) into the shared store. Never mixes the two. */
export function DataLoader() {
  const mode = useFire((s) => s.mode);
  const live = useFire((s) => s.live);
  const status = useServerFn(getFirmsStatus);
  const fetchLive = useServerFn(fetchFirms);

  useEffect(() => {
    status()
      .then((r) => useFire.getState().set({ liveConfigured: r.configured }))
      .catch(() => useFire.getState().set({ liveConfigured: false }));
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    const s = useFire.getState();
    s.set({ status: "loading", error: null, data: null, selection: null });
    if (mode === "demo") {
      setTimeout(() => !cancelled && useFire.getState().setDataset(generateDemoDataset(todayUtc())), 0);
      return () => void (cancelled = true);
    }
    fetchLive({ data: { source: live.source, region: live.region, endDate: live.endDate ?? todayUtc(), days: live.days } })
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          useFire.getState().set({ status: "error", error: r.error });
          return;
        }
        for (const rec of r.records) rec.country = countryAt(rec.lat, rec.lon);
        useFire.getState().setDataset({
          kind: "live",
          source: live.source,
          region: live.region,
          records: r.records,
          dates: r.dates,
          missingDates: r.missingDates,
          fetchedAt: r.fetchedAt,
          truncated: r.truncated,
          notes: r.notes,
        });
      })
      .catch(() => !cancelled && useFire.getState().set({ status: "error", error: "Could not reach the FIRMS proxy. No observations are shown." }));
    return () => void (cancelled = true);
  }, [mode, live, fetchLive]);

  return null;
}
