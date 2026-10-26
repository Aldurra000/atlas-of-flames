import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ARCHIVE_LAST_YEAR, ARCHIVE_SENSORS, summarizeArchiveCsv, validateYear, type ArchiveSensor } from "./archive";

const MAX_BYTES = 90_000_000;

const input = z.object({
  sensor: z.enum(Object.keys(ARCHIVE_SENSORS) as [ArchiveSensor, ...ArchiveSensor[]]),
  year: z.number().int().min(2000).max(ARCHIVE_LAST_YEAR),
  country: z.string().regex(/^[\p{L}\p{M}0-9_.'()-]{2,60}$/u),
});

/** Fetch one NASA FIRMS yearly country archive file and return compact daily aggregates. */
export const fetchCountryArchive = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }) => {
    if (data.year < ARCHIVE_SENSORS[data.sensor].firstYear)
      return { ok: false as const, status: "unavailable" as const, message: `${ARCHIVE_SENSORS[data.sensor].short} archive starts in ${ARCHIVE_SENSORS[data.sensor].firstYear}.` };
    const url = `https://firms.modaps.eosdis.nasa.gov/data/country/${data.sensor}/${data.year}/${data.sensor}_${data.year}_${encodeURIComponent(data.country)}.csv`;
    let lastErr = "Network error or timeout retrieving the archive file.";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(50000) });
        if (res.status === 404) return { ok: false as const, status: "unavailable" as const, message: "NASA publishes no archive file for this country/year (HTTP 404)." };
        if (res.status >= 500 || res.status === 429) {
          lastErr = `NASA archive request failed (HTTP ${res.status}) after retry.`;
          await res.body?.cancel();
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (!res.ok) return { ok: false as const, status: "error" as const, message: `NASA archive request failed (HTTP ${res.status}).` };
        const len = Number(res.headers.get("content-length") ?? 0);
        if (len > MAX_BYTES) {
          await res.body?.cancel();
          return { ok: false as const, status: "error" as const, message: `File too large for this proxy (${Math.round(len / 1e6)} MB); year not included.` };
        }
        const buf = await res.arrayBuffer();
        if (len && buf.byteLength < len) {
          lastErr = `Incomplete download (${buf.byteLength} of ${len} bytes).`;
          continue;
        }
        const text = new TextDecoder().decode(buf);
        if (!/^latitude,/.test(text.trimStart())) return { ok: false as const, status: "invalid" as const, message: "Response is not a FIRMS archive CSV." };
        const summary = summarizeArchiveCsv(text, data.year);
        const v = validateYear(summary);
        if (!v.ok) return { ok: false as const, status: "invalid" as const, message: v.message };
        return { ok: true as const, summary, url, bytes: buf.byteLength };
      } catch (e) {
        console.error("FIRMS archive fetch failed", e instanceof Error ? e.message : String(e));
      }
    }
    return { ok: false as const, status: "error" as const, message: lastErr };
  });
