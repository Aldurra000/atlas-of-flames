import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LIVE_SOURCES } from "./types";
import { parseFirmsCsv, redact, REGION_PRESETS } from "./firms";
import { addDays, dateRange, todayUtc } from "./dates";

export const getFirmsStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: Boolean(process.env["FIRMS_MAP_KEY"]) };
});

const input = z.object({
  source: z.enum(LIVE_SOURCES),
  region: z.string().refine((r) => r in REGION_PRESETS, "Unknown region"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(1).max(10),
});

export const fetchFirms = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env["FIRMS_MAP_KEY"];
    if (!key) return { ok: false as const, error: "FIRMS_MAP_KEY is not configured on the server." };
    if (data.endDate > todayUtc()) return { ok: false as const, error: "End date cannot be in the future." };
    if (data.endDate < "2000-11-01") return { ok: false as const, error: "Date precedes the MODIS record." };

    const start = addDays(data.endDate, -(data.days - 1));
    const region = REGION_PRESETS[data.region];
    if (!region) return { ok: false as const, error: "Unknown region." };
    const area = region.area;
    // Retrieve each complete day; never select a highest-FRP sample for statistics.
    const chunks = dateRange(start, data.endDate).map((s) => ({ start: s, days: 1 }));

    const records = [] as ReturnType<typeof parseFirmsCsv>;
    const missing: string[] = [];
    const notes: string[] = [];
    let returnedRecordCount = 0;
    const dailyCounts: Record<string, { returned: number; loaded: number }> = {};
    for (const c of chunks) {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${data.source}/${area}/${c.days}/${c.start}`;
      const chunkDates = dateRange(c.start, addDays(c.start, c.days - 1));
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
        const text = await res.text();
        if (res.status === 429 || /exceed/i.test(text.slice(0, 200))) {
          notes.push("FIRMS rate limit reached; some dates could not be retrieved.");
          missing.push(...chunkDates);
          continue;
        }
        if (!res.ok || /invalid/i.test(text.slice(0, 120))) {
          notes.push(`FIRMS rejected the request for ${c.start} (HTTP ${res.status}). Check the product, dates and key configuration.`);
          missing.push(...chunkDates);
          continue;
        }
        const parsed = parseFirmsCsv(text, data.source);
        const returned = text.trim().split(/\r?\n/).length - 1;
        returnedRecordCount += returned;
        dailyCounts[c.start] = { returned, loaded: parsed.length };
        if (returned !== parsed.length) notes.push(`${c.start}: ${returned - parsed.length} malformed rows excluded; counts are incomplete.`);
        for (const r of parsed) records.push(r);
      } catch (e) {
        console.error("FIRMS fetch failed", redact(e instanceof Error ? e.message : String(e), key));
        notes.push(`Network error retrieving ${c.start} (+${c.days}d).`);
        missing.push(...chunkDates);
      }
    }
    // If no date could be retrieved, this is a failure — never present it as "live, zero detections".
    if (missing.length >= dateRange(start, data.endDate).length) {
      return { ok: false as const, error: `No FIRMS observations could be retrieved. ${notes.join(" ")}`.trim() };
    }
    const truncated = returnedRecordCount !== records.length;
    if (data.source.endsWith("_NRT")) notes.push("NRT products cover roughly the last 2 months; the most recent day may still be filling in.");
    return {
      ok: true as const,
      records,
      returnedRecordCount,
      dailyCounts,
      dates: dateRange(start, data.endDate),
      missingDates: missing,
      truncated,
      notes,
      fetchedAt: new Date().toISOString(),
    };
  });
