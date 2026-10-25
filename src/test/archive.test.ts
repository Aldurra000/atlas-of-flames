import { describe, expect, it } from "vitest";
import { firmsCountryName, monthAnomaly, recurringPeakMonths, summarizeArchiveCsv } from "@/lib/fire/archive";
import { resolveRegion } from "@/lib/fire/firms";

const H = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type";
describe("archive summarize", () => {
  it("dedups same-cell detections and excludes static sources / low confidence", () => {
    const csv = [H,
      "38.001,23.001,310,1,1,2020-08-01,0900,Terra,MODIS,80,6.1,290,10,D,0",
      "38.002,23.002,310,1,1,2020-08-01,1300,Aqua,MODIS,80,6.1,290,10,D,0", // same 0.05° cell
      "38.2,23.2,310,1,1,2020-08-01,1300,Aqua,MODIS,10,6.1,290,10,D,0", // low confidence
      "38.3,23.3,310,1,1,2020-08-01,1300,Aqua,MODIS,90,6.1,290,10,D,2", // static source
      "bad,row",
    ].join("\n");
    const s = summarizeArchiveCsv(csv);
    expect(s.days["2020-08-01"]).toEqual([4, 2, 1]);
    expect(s.malformed).toBe(1);
  });
});
describe("monthly anomaly", () => {
  const m = (v: number) => Array(12).fill(0).map((_, i) => (i === 7 ? v : 0));
  it("reports insufficient data with fewer than 10 baseline years", () => {
    const mat = new Map([2020, 2021, 2022].map((y) => [y, m(100)]));
    expect(monthAnomaly(mat, 2022, 7).status).toBe("insufficient");
  });
  it("flags a strong month against a 10-year same-month baseline", () => {
    const mat = new Map(Array.from({ length: 10 }, (_, i) => [2010 + i, m(100 + (i % 2) * 10)] as [number, number[]]));
    mat.set(2024, m(400));
    const a = monthAnomaly(mat, 2024, 7);
    expect(a.status).toBe("strong");
    expect(a.baselineYears).toHaveLength(10);
  });
  it("finds August as a recurring peak", () => {
    const mat = new Map(Array.from({ length: 6 }, (_, i) => [2010 + i, Array(12).fill(5).map((v, j) => (j === 7 ? 200 : v))] as [number, number[]]));
    expect(recurringPeakMonths(mat)?.[0]?.month).toBe(7);
  });
});
describe("areas", () => {
  it("maps map names to NASA file names", () => expect(firmsCountryName("United States of America")).toBe("United_States"));
  it("validates custom bounding boxes", () => {
    expect(resolveRegion("bbox:20,35,28,42")?.area).toBe("20,35,28,42");
    expect(resolveRegion("bbox:28,35,20,42")).toBeNull();
  });
});
