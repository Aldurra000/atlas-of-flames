import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (fn: () => unknown) => fn,
    inputValidator: (validate: (d: unknown) => unknown) => ({
      handler: (fn: (args: { data: unknown }) => unknown) => (args: { data: unknown }) => fn({ data: validate(args.data) }),
    }),
  }),
}));

import { fetchFirms } from "@/lib/fire/firms.functions";

const header = "latitude,longitude,acq_date,acq_time,frp,confidence,daynight";
const request = { source: "VIIRS_SNPP_NRT" as const, region: "world", endDate: "2026-10-23", days: 1 };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("NASA response honesty", () => {
  it("loads all 20,001 returned records without a 20,000-row sample", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-only-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(header + "\n" + Array.from({ length: 20001 }, (_, i) => `-10,${20 + i / 100000},2026-10-23,1200,5,n,D`).join("\n"))));
    const result = await fetchFirms({ data: request });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Unexpected failure");
    expect(result.returnedRecordCount).toBe(20001);
    expect(result.records).toHaveLength(20001);
    expect(result.truncated).toBe(false);
  });
  it("distinguishes successful zero detections from unavailable observations", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-only-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(header)));
    const result = await fetchFirms({ data: request });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Unexpected failure");
    expect(result.records).toHaveLength(0);
    expect(result.missingDates).toEqual([]);
  });
  it.each([401, 429, 500])("reports NASA HTTP %i as unavailable, not zero", async (status) => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-only-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Rejected", { status })));
    expect((await fetchFirms({ data: request })).ok).toBe(false);
  });
  it("reports network failures without exposing the server key", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-only-key");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network test-only-key failed")));
    const result = await fetchFirms({ data: request });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("test-only-key");
    expect(log).toHaveBeenCalledWith("FIRMS fetch failed", "Network [REDACTED] failed");
    log.mockRestore();
  });
  it("rejects more than 10 requested days", async () => {
    await expect(fetchFirms({ data: { ...request, days: 11 } })).rejects.toThrow();
  });
});