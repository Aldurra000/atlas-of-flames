import type { Dataset, Detection } from "./types";
import { addDays, dateRange, toUtc } from "./dates";

/**
 * SYNTHETIC demonstration records. These are NOT NASA observations.
 * They exist only so the interface can be explored before FIRMS_MAP_KEY is configured.
 */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS: { country: string; lat: number; lon: number; spread: number; base: number; peak: number }[] = [
  { country: "Brazil", lat: -9, lon: -55, spread: 4, base: 22, peak: 8 },
  { country: "Bolivia", lat: -16, lon: -63, spread: 2.5, base: 8, peak: 8 },
  { country: "Dem. Rep. Congo", lat: -6, lon: 23, spread: 3.5, base: 18, peak: 7 },
  { country: "Angola", lat: -12, lon: 18, spread: 3, base: 16, peak: 7 },
  { country: "Zambia", lat: -14, lon: 27, spread: 2.5, base: 10, peak: 8 },
  { country: "Central African Rep.", lat: 6.5, lon: 21, spread: 2.5, base: 12, peak: 1 },
  { country: "Nigeria", lat: 9.5, lon: 8, spread: 2.5, base: 10, peak: 1 },
  { country: "S. Sudan", lat: 7.5, lon: 30, spread: 2.5, base: 9, peak: 1 },
  { country: "Australia", lat: -16, lon: 132, spread: 4, base: 12, peak: 9 },
  { country: "Indonesia", lat: -1.5, lon: 113.5, spread: 2, base: 7, peak: 9 },
  { country: "Myanmar", lat: 20, lon: 96, spread: 2, base: 8, peak: 3 },
  { country: "Thailand", lat: 17.5, lon: 100, spread: 1.5, base: 6, peak: 3 },
  { country: "India", lat: 30.5, lon: 75.5, spread: 1.5, base: 8, peak: 10 },
  { country: "Russia", lat: 58, lon: 120, spread: 5, base: 10, peak: 7 },
  { country: "Kazakhstan", lat: 50, lon: 70, spread: 3, base: 5, peak: 4 },
  { country: "Canada", lat: 56, lon: -118, spread: 4, base: 7, peak: 7 },
  { country: "United States of America", lat: 39, lon: -121, spread: 2.5, base: 5, peak: 8 },
  { country: "Mexico", lat: 18, lon: -93, spread: 2, base: 5, peak: 4 },
  { country: "Argentina", lat: -27, lon: -61, spread: 2.5, base: 4, peak: 9 },
  { country: "Portugal", lat: 40, lon: -8, spread: 0.8, base: 2, peak: 8 },
  { country: "Greece", lat: 39, lon: 22, spread: 1, base: 2, peak: 8 },
  { country: "Turkey", lat: 37.5, lon: 31, spread: 1.5, base: 2, peak: 8 },
];

// a gap in the record so the UI can show "missing data" distinctly from "no detections"
const MISSING_OFFSETS = [17, 18, 96, 203];

export function generateDemoDataset(endDate: string, days = 400): Dataset {
  const r = rng(20261021);
  const start = addDays(endDate, -(days - 1));
  const dates = dateRange(start, endDate);
  const missing = MISSING_OFFSETS.map((o) => dates[dates.length - 1 - o]).filter(Boolean) as string[];
  const missingSet = new Set(missing);
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
  const records: Detection[] = [];
  for (const [di, date] of dates.entries()) {
    if (missingSet.has(date)) continue;
    const month = toUtc(date).getUTCMonth() + 1;
    const recent = dates.length - di;
    for (const reg of REGIONS) {
      const dm = Math.min(Math.abs(month - reg.peak), 12 - Math.abs(month - reg.peak));
      let lambda = reg.base * (0.12 + Math.exp(-(dm * dm) / 3));
      // injected synthetic surge (demo only) so anomaly detection has something to find
      if (reg.country === "Kazakhstan" && recent <= 9) lambda *= 5;
      if (reg.country === "Greece" && recent <= 5) lambda *= 4;
      const n = Math.max(0, Math.round(lambda + gauss() * Math.sqrt(lambda)));
      for (let k = 0; k < n; k++) {
        const lat = +(reg.lat + gauss() * reg.spread * 0.5).toFixed(4);
        const lon = +(reg.lon + gauss() * reg.spread * 0.6).toFixed(4);
        const viirs = r() < 0.75;
        const hh = String(Math.floor(r() * 24)).padStart(2, "0");
        const mm = String(Math.floor(r() * 60)).padStart(2, "0");
        const frp = +(Math.exp(1 + gauss() * 1.1) * (viirs ? 1 : 3)).toFixed(1);
        const confLetter = r() < 0.15 ? "l" : r() < 0.85 ? "n" : "h";
        const time = `${hh}${mm}`;
        records.push({
          id: `DEMO:${date}T${time}:${lat},${lon}:${k}`,
          lat,
          lon,
          date,
          time,
          source: "DEMO_SYNTHETIC",
          satellite: viirs ? "N" : "Aqua",
          instrument: viirs ? "VIIRS (simulated)" : "MODIS (simulated)",
          confidence: viirs ? confLetter : String(Math.round(r() * 100)),
          confidenceLevel: viirs ? (confLetter === "l" ? "low" : confLetter === "n" ? "nominal" : "high") : "nominal",
          brightness: +(320 + Math.abs(gauss()) * 25).toFixed(1),
          brightness2: +(290 + gauss() * 6).toFixed(1),
          frp,
          daynight: Number(hh) >= 6 && Number(hh) < 18 ? "D" : "N",
          scan: +(0.39 + r() * 0.3).toFixed(2),
          track: +(0.36 + r() * 0.2).toFixed(2),
          version: "demo",
          country: reg.country,
          isDemo: true,
          raw: { note: "synthetic demonstration record — not a NASA observation" },
        });
      }
    }
  }
  return {
    kind: "demo",
    source: "DEMO_SYNTHETIC",
    region: "world",
    records,
    dates,
    missingDates: missing,
    fetchedAt: new Date().toISOString(),
    truncated: false,
    notes: [
      "Synthetic records generated in the browser for demonstration. Not live NASA observations.",
      "Includes injected synthetic surges (Kazakhstan, Greece) to exercise anomaly detection.",
    ],
  };
}
