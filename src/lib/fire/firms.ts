import type { ConfidenceLevel, Detection, LiveSource } from "./types";

export function confidenceLevel(raw: string | null | undefined): ConfidenceLevel {
  if (raw == null || raw === "") return "unknown";
  const v = raw.trim().toLowerCase();
  if (v === "l" || v === "low") return "low";
  if (v === "n" || v === "nominal") return "nominal";
  if (v === "h" || v === "high") return "high";
  const n = Number(v);
  if (Number.isFinite(n)) return n < 30 ? "low" : n < 80 ? "nominal" : "high"; // MODIS classes
  return "unknown";
}

const num = (v: string | undefined) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Parse a NASA FIRMS area-API CSV (MODIS or VIIRS) into normalized detections. */
export function parseFirmsCsv(text: string, source: LiveSource): Detection[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 1) return [];
  const header = (lines[0] ?? "").split(",").map((h) => h.trim());
  if (!header.includes("latitude") || !header.includes("longitude")) {
    throw new Error("Unexpected FIRMS response format");
  }
  const out: Detection[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] ?? "").split(",");
    if (cols.length < header.length) continue;
    const raw: Record<string, string> = {};
    header.forEach((h, j) => (raw[h] = cols[j]?.trim() ?? ""));
    const lat = Number(raw["latitude"]);
    const lon = Number(raw["longitude"]);
    if (!raw["latitude"] || !raw["longitude"] || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const date = raw["acq_date"] ?? "";
    const time = (raw["acq_time"] ?? "").padStart(4, "0");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}$/.test(time) || Number(time.slice(0, 2)) > 23 || Number(time.slice(2)) > 59) continue;
    const isViirs = "bright_ti4" in raw;
    const dn = raw["daynight"];
    out.push({
      id: `${source}:${date}T${time}:${lat.toFixed(5)},${lon.toFixed(5)}`,
      lat,
      lon,
      date,
      time,
      source,
      satellite: raw["satellite"] || null,
      instrument: raw["instrument"] || (isViirs ? "VIIRS" : "MODIS"),
      confidence: raw["confidence"] || null,
      confidenceLevel: confidenceLevel(raw["confidence"]),
      brightness: num(isViirs ? raw["bright_ti4"] : raw["brightness"]),
      brightness2: num(isViirs ? raw["bright_ti5"] : raw["bright_t31"]),
      frp: num(raw["frp"]),
      daynight: dn === "D" || dn === "N" ? dn : null,
      scan: num(raw["scan"]),
      track: num(raw["track"]),
      version: raw["version"] || null,
      country: null,
      isDemo: false,
      raw,
    });
  }
  return out;
}

/** Remove any occurrence of the secret from a string before it can reach logs or clients. */
export function redact(message: string, secret: string | undefined) {
  if (!secret) return message;
  return message.split(secret).join("[REDACTED]");
}

export const REGION_PRESETS: Record<string, { label: string; area: string }> = {
  world: { label: "World", area: "world" },
  north_america: { label: "North America", area: "-170,10,-50,75" },
  south_america: { label: "South America", area: "-82,-56,-34,13" },
  europe: { label: "Europe", area: "-25,34,45,72" },
  africa: { label: "Africa", area: "-20,-36,55,38" },
  asia: { label: "Asia & Russia", area: "45,0,180,78" },
  southeast_asia: { label: "Southeast Asia", area: "90,-11,155,28" },
  oceania: { label: "Australia & Oceania", area: "110,-50,180,0" },
};
