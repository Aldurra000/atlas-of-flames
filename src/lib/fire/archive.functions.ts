import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ARCHIVE_LAST_YEAR, ARCHIVE_SENSORS, summarizeArchiveCsv, type ArchiveSensor } from "./archive";

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
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(50000) });
      if (res.status === 404) return { ok: false as const, status: "unavailable" as const, message: "NASA publishes no archive file for this country/year (HTTP 404)." };
      if (!res.ok) return { ok: false as const, status: "error" as const, message: `NASA archive request failed (HTTP ${res.status}).` };
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_BYTES) {
        await res.body?.cancel();
        return { ok: false as const, status: "error" as const, message: `File too large for this proxy (${Math.round(len / 1e6)} MB); year not included.` };
      }
      const summary = summarizeArchiveCsv(await res.text());
      return { ok: true as const, summary };
    } catch (e) {
      console.error("FIRMS archive fetch failed", e instanceof Error ? e.message : String(e));
      return { ok: false as const, status: "error" as const, message: "Network error or timeout retrieving the archive file." };
    }
  });
