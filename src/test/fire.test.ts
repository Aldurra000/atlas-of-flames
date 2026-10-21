import { describe, expect, it } from "vitest";
import { latLonToXYZ, xyzToLatLon } from "@/lib/fire/geo";
import { computeAnomaly } from "@/lib/fire/analytics";
import { parseFirmsCsv, redact } from "@/lib/fire/firms";
import { dateRange } from "@/lib/fire/dates";

describe("fire core", () => {
  it("round-trips lat/lon through globe coordinates", () => {
    const [x, y, z] = latLonToXYZ(-33.9, 151.2, 1);
    const r = xyzToLatLon(x, y, z);
    expect(r.lat).toBeCloseTo(-33.9, 5);
    expect(r.lon).toBeCloseTo(151.2, 5);
  });
  it("reports insufficient history instead of flagging", () => {
    const dates = dateRange("2026-01-01", "2026-01-10");
    const daily = new Map(dates.map((d) => [d, 50]));
    expect(computeAnomaly(daily, new Set(dates), "2026-01-10", 7).status).toBe("insufficient");
  });
  it("flags a surge above a stable baseline", () => {
    const dates = dateRange("2026-01-01", "2026-03-31");
    const daily = new Map(dates.map((d) => [d, d >= "2026-03-25" ? 40 : 10]));
    expect(computeAnomaly(daily, new Set(dates), "2026-03-31", 7).status).toBe("strong");
  });
  it("parses VIIRS CSV and rejects error text", () => {
    const csv = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n-10.5,20.1,330.2,0.4,0.37,2026-10-20,112,N,VIIRS,n,2.0NRT,295.1,5.3,D";
    const r = parseFirmsCsv(csv, "VIIRS_SNPP_NRT");
    expect(r[0]).toMatchObject({ lat: -10.5, frp: 5.3, confidenceLevel: "nominal", time: "0112", isDemo: false });
    expect(() => parseFirmsCsv("Invalid MAP_KEY.", "VIIRS_SNPP_NRT")).toThrow();
    expect(redact("url/abc123/x", "abc123")).toBe("url/[REDACTED]/x");
  });
});
