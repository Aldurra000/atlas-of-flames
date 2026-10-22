import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LIVE_SOURCES } from "./types";
import { parseFirmsCsv, redact, REGION_PRESETS } from "./firms";
import { addDays, dateRange, todayUtc } from "./dates";

const MAX_ROWS = 20000;

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
    const area = REGION_PRESETS[data.region]!.area;
    // One request per day so a busy day can never crowd a later day out of the row cap.
    const chunks = dateRange(start, data.endDate).map((s) => ({ start: s, days: 1 }));
    const perDayCap = Math.floor(MAX_ROWS / chunks.length);

    const records = [] as ReturnType<typeof parseFirmsCsv>;
    const missing: string[] = [];
    const notes: string[] = [];
    let truncated = false;
    for (const c of chunks) {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${data.source}/${area}/${c.days}/${c.start}`;
      const chunkDates = dateRange(c.start, addDays(c.start, c.days - 1));
      try {
        const res = await fetch(url);
        const text = await res.text();
        if (res.status === 429 || /exceed/i.test(text.slice(0, 200))) {
          notes.push("FIRMS rate limit reached; some dates could not be retrieved.");
          missing.push(...chunkDates);
          continue;
        }
        if (!res.ok || /invalid/i.test(text.slice(0, 120))) {
          notes.push(`FIRMS returned an error for ${c.start} (+${c.days}d): ${redact(text.slice(0, 120), key)}`);
          missing.push(...chunkDates);
          continue;
        }
        const parsed = parseFirmsCsv(text, data.source);
        if (parsed.length > perDayCap) {
          truncated = true;
          notes.push(`${c.start}: NASA returned ${parsed.length.toLocaleString()} detections; showing the ${perDayCap.toLocaleString()} with highest FRP. Counts for this day are a lower bound.`);
          parsed.sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0));
        }
        for (const r of parsed.slice(0, perDayCap)) records.push(r);
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
    if (truncated) notes.push(`Response capped at ${MAX_ROWS.toLocaleString()} detections. Choose a smaller region or window for complete coverage.`);
    if (data.source.endsWith("_NRT")) notes.push("NRT products cover roughly the last 2 months; the most recent day may still be filling in.");
    return {
      ok: true as const,
      records,
      dates: dateRange(start, data.endDate),
      missingDates: missing,
      truncated,
      notes,
      fetchedAt: new Date().toISOString(),
    };
  });
