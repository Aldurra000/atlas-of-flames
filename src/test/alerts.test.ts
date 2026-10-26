import { describe, expect, it } from "vitest";
import { computeAlerts, notifiable } from "@/lib/fire/alerts";
import { EMERGENCY_DIRECTORY, emergencyFor } from "@/lib/fire/emergency";
import { summarizeArchiveCsv, validateYear, yearLadder } from "@/lib/fire/archive";
import type { Detection } from "@/lib/fire/types";
import type { AnomalyResult } from "@/lib/fire/analytics";

const det = (i: number, conf: Detection["confidenceLevel"], o: Partial<Detection> = {}): Detection => ({
  id: String(i), lat: 23.1 + i * 0.001, lon: 57.1, date: "2026-10-25", time: "1000", source: "VIIRS_SNPP_NRT",
  satellite: "N", instrument: "VIIRS", confidence: conf[0]!, confidenceLevel: conf, brightness: null, brightness2: null,
  frp: 5, daynight: "D", scan: null, track: null, version: null, country: "Oman", isDemo: false, raw: {}, ...o,
} as Detection);
const NOW = Date.parse("2026-10-25T14:00:00Z");
const base = { anomalies: new Map<string, AnomalyResult>(), sourceLabel: "VIIRS", simulated: false, now: NOW };

describe("alerts", () => {
  it("raises INFORMATIONAL for a small fresh cluster", () => {
    const { alerts } = computeAlerts({ ...base, records: Array.from({ length: 6 }, (_, i) => det(i, "nominal")) });
    expect(alerts[0]!.severity).toBe("info");
  });
  it("needs both concentration and high confidence for HIGH, not count alone", () => {
    const lowConf = computeAlerts({ ...base, records: Array.from({ length: 40 }, (_, i) => det(i, "nominal")) });
    expect(lowConf.alerts[0]!.severity).toBe("info");
    const hi = computeAlerts({ ...base, records: Array.from({ length: 30 }, (_, i) => det(i, i < 6 ? "high" : "nominal")) });
    expect(hi.alerts[0]!.severity).toBe("high");
  });
  it("ignores low-confidence detections", () => {
    expect(computeAlerts({ ...base, records: Array.from({ length: 50 }, (_, i) => det(i, "low")) }).alerts).toHaveLength(0);
  });
  it("expires stale observations after 72 h", () => {
    const r = computeAlerts({ ...base, now: NOW + 80 * 3.6e6, records: Array.from({ length: 30 }, (_, i) => det(i, "high")) });
    expect(r.alerts).toHaveLength(0);
    expect(r.expired).toBe(1);
  });
  it("produces MODERATE statistical alerts from an elevated anomaly", () => {
    const an = new Map([["Oman", { status: "elevated", observed: 3, baselineMean: 0.5, z: 2.5, validWindows: 8 } as AnomalyResult]]);
    const r = computeAlerts({ ...base, anomalies: an, records: [det(1, "nominal")] });
    expect(r.alerts[0]).toMatchObject({ severity: "moderate", kind: "statistical" });
  });
  it("never generates CRITICAL and labels demo alerts simulated", () => {
    const r = computeAlerts({ ...base, simulated: true, records: Array.from({ length: 30 }, (_, i) => det(i, "high")) });
    expect(r.alerts.every((a) => a.severity !== "critical" && a.simulated && a.title.startsWith("SIMULATED"))).toBe(true);
  });
  it("dedupes by stable id and re-notifies only on escalation", () => {
    const { alerts } = computeAlerts({ ...base, records: Array.from({ length: 30 }, (_, i) => det(i, "high")) });
    expect(notifiable(alerts, { "Oman|observational": "high" }, "info", null)).toHaveLength(0);
    expect(notifiable(alerts, { "Oman|observational": "info" }, "info", null)).toHaveLength(1);
    expect(notifiable(alerts, {}, "info", "Greece")).toHaveLength(0);
  });
});

describe("emergency directory", () => {
  it("lists only Oman's verified number with source and date", () => {
    expect(EMERGENCY_DIRECTORY.Oman!.numbers[0]!.number).toBe("9999");
    expect(EMERGENCY_DIRECTORY.Oman!.source.url).toMatch(/^https:\/\/gov\.om\//);
    expect(emergencyFor("Greece")).toBeNull();
  });
});

describe("archive validation", () => {
  const H = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type";
  it("rejects a mislabelled year file", () => {
    const s = summarizeArchiveCsv([H, "1,1,300,1,1,2019-05-01,0100,T,MODIS,80,6.1,290,1,D,0"].join("\n"), 2020);
    expect(validateYear(s).ok).toBe(false);
  });
  it("rejects mostly-malformed files", () => {
    expect(validateYear(summarizeArchiveCsv([H, "x", "y", "1,1,300,1,1,2020-05-01,0100,T,MODIS,80,6.1,290,1,D,0"].join("\n"), 2020)).ok).toBe(false);
  });
  it("treats a header-only file as valid but not usable", () => {
    const s = summarizeArchiveCsv(H, 2020);
    expect(validateYear(s).ok).toBe(true);
    expect(yearLadder({ status: "ok", summary: s })).toEqual({ exists: true, downloaded: true, validated: true, usable: false });
    expect(yearLadder({ status: "unavailable", message: "" }).exists).toBe(false);
    expect(yearLadder(undefined).downloaded).toBe(false);
  });
});
