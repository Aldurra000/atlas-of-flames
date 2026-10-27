import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataLoader } from "@/components/fire/DataLoader";
import { Timeline } from "@/components/fire/Timeline";
import { useFire } from "@/lib/fire/store";
import { addDays, todayUtc } from "@/lib/fire/dates";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), status: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/fire/firms.functions", () => ({ fetchFirms: mocks.fetch, getFirmsStatus: mocks.status }));
vi.mock("@/lib/fire/geo", () => ({ countryAt: () => "Oman" }));

async function flush() { await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); }
beforeEach(() => {
  vi.useFakeTimers();
  mocks.status.mockResolvedValue({ configured: true });
  mocks.fetch.mockImplementation(async ({ data }: { data: { endDate: string } }) => ({
    ok: true, csvChunks: [`latitude,longitude,acq_date,acq_time,frp,confidence,daynight\n20,55,${data.endDate},1200,5,n,D`],
    returnedRecordCount: 1, dailyCounts: { [data.endDate]: { returned: 1, loaded: 1 } },
    notes: [], truncated: false, fetchedAt: new Date().toISOString(),
  }));
  useFire.setState({ ...useFire.getInitialState() });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("Seven-day live loading and refresh", () => {
  it("defaults to seven actual dated daily requests and a 30-minute refresh", async () => {
    expect(useFire.getState().live.days).toBe(7);
    expect(useFire.getState().refreshMinutes).toBe(30);
    render(<DataLoader />); await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(7);
    expect(mocks.fetch.mock.calls.map(([r]) => r.data.endDate)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(todayUtc(), i - 6)));
    expect(useFire.getState().data?.ds.records).toHaveLength(7);
    await act(async () => { vi.advanceTimersByTime(30 * 60_000); }); await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(14);
  });

  it("retains records, selected date and retrieval timestamp when manual refresh fails", async () => {
    render(<DataLoader />); await flush();
    const previous = useFire.getState().data;
    useFire.getState().set({ selectedDate: addDays(todayUtc(), -3) });
    mocks.fetch.mockResolvedValue({ ok: false, error: "NASA HTTP 429" });
    await act(async () => useFire.getState().requestRefresh()); await flush();
    expect(useFire.getState().data).toBe(previous);
    expect(useFire.getState().selectedDate).toBe(addDays(todayUtc(), -3));
    expect(useFire.getState().refreshError).toContain("Previous observations retained");
    expect(useFire.getState().refreshing).toBe(false);
  });

  it("does not replace valid observations with a partially failed refresh", async () => {
    render(<DataLoader />); await flush();
    const previous = useFire.getState().data;
    mocks.fetch.mockResolvedValueOnce({ ok: false, error: "NASA unavailable" });
    await act(async () => useFire.getState().requestRefresh()); await flush();
    expect(useFire.getState().data).toBe(previous);
    expect(useFire.getState().refreshError).toContain("Refresh incomplete");
  });

  it("never fabricates records on unavailable initial dates", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, error: "NASA unavailable" });
    render(<DataLoader />); await flush();
    expect(useFire.getState().data?.ds.records).toHaveLength(6);
    expect(useFire.getState().data?.ds.missingDates).toEqual([addDays(todayUtc(), -6)]);
  });

  it("does not overlap manual or scheduled requests and cleans up its timer", async () => {
    let release: (() => void) | undefined;
    mocks.fetch.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }).then(() => ({ ok: false, error: "unavailable" })));
    const view = render(<DataLoader />); await flush();
    await act(async () => { useFire.getState().requestRefresh(); vi.advanceTimersByTime(60 * 60_000); }); await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    release?.(); await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(7);
    view.unmount();
    vi.advanceTimersByTime(60 * 60_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(7);
  });

  it("preserves exploration on successful refresh and allows disabling automatic fetching", async () => {
    const view = render(<DataLoader />); await flush();
    useFire.getState().set({ selectedDate: addDays(todayUtc(), -2), playing: true });
    await act(async () => useFire.getState().requestRefresh()); await flush();
    expect(useFire.getState().selectedDate).toBe(addDays(todayUtc(), -2));
    expect(useFire.getState().playing).toBe(true);
    await act(async () => useFire.getState().set({ refreshMinutes: 0 }));
    vi.advanceTimersByTime(60 * 60_000); await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(14);
    view.unmount();
  });

  it("plays real dates, supports pause and day stepping, and stops at the final date", async () => {
    render(<DataLoader />); await flush();
    const view = render(<Timeline />);
    act(() => view.getByRole("button", { name: "Previous day" }).click());
    expect(useFire.getState().selectedDate).toBe(addDays(todayUtc(), -1));
    act(() => view.getByRole("button", { name: "Next day" }).click());
    expect(useFire.getState().selectedDate).toBe(todayUtc());
    act(() => view.getByRole("button", { name: /^Play$/ }).click());
    expect(useFire.getState().selectedDate).toBe(addDays(todayUtc(), -6));
    act(() => vi.advanceTimersByTime(900));
    expect(useFire.getState().selectedDate).toBe(addDays(todayUtc(), -5));
    act(() => view.getByRole("button", { name: /^Pause$/ }).click());
    act(() => vi.advanceTimersByTime(900));
    expect(useFire.getState().selectedDate).toBe(addDays(todayUtc(), -5));
    act(() => view.getByRole("button", { name: /^Play$/ }).click());
    act(() => vi.advanceTimersByTime(7 * 900));
    expect(useFire.getState().selectedDate).toBe(todayUtc());
    expect(useFire.getState().playing).toBe(false);
    expect(useFire.getState().data?.byDate.get(todayUtc())?.[0]?.date).toBe(todayUtc());
  });
});