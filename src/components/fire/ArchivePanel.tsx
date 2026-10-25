import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { useFire } from "@/lib/fire/store";
import { fetchCountryArchive } from "@/lib/fire/archive.functions";
import {
  ARCHIVE_LAST_YEAR,
  ARCHIVE_SENSORS,
  METRIC_LABELS,
  crossSensorRatio,
  firmsCountryName,
  monthAnomaly,
  monthlyMatrix,
  recurringPeakMonths,
  type ArchiveSensor,
  type Metric,
} from "@/lib/fire/archive";
import { countryFeature } from "@/lib/fire/geo";
import { geoBounds } from "d3-geo";
import { addDays, todayUtc } from "@/lib/fire/dates";
import { Seg } from "./Timeline";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const heat = (t: number) => `color-mix(in oklab, var(--fire) ${Math.round(20 + 80 * t)}%, var(--ember) ${Math.round(80 - 80 * t)}%)`;

/** Long-term burning-activity calendar from NASA FIRMS yearly country archives (2000–). */
export function ArchivePanel() {
  const country = useFire((s) => s.country);
  const archive = useFire((s) => s.archive);
  const setYear = useFire((s) => s.setArchiveYear);
  const set = useFire((s) => s.set);
  const fetchYear = useServerFn(fetchCountryArchive);
  const [sensor, setSensor] = useState<ArchiveSensor>("modis");
  const [metric, setMetric] = useState<Metric>(2);
  const [sel, setSel] = useState<{ y: number; m: number } | null>(null);
  const [cmp, setCmp] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  const years = archive.country === country ? archive.years : { modis: {}, "viirs-snpp": {} };
  const matrix = useMemo(() => monthlyMatrix(years[sensor], metric), [years, sensor, metric]);
  const allYears = Array.from({ length: ARCHIVE_LAST_YEAR - ARCHIVE_SENSORS[sensor].firstYear + 1 }, (_, i) => ARCHIVE_SENSORS[sensor].firstYear + i);
  const max = Math.max(1, ...[...matrix.values()].flat());
  const okYears = [...matrix.keys()].sort();
  const selY = sel?.y ?? okYears[okYears.length - 1] ?? null;
  const an = sel && matrix.has(sel.y) ? monthAnomaly(matrix, sel.y, sel.m) : null;
  const peaks = useMemo(() => recurringPeakMonths(matrix), [matrix]);
  const ratio = useMemo(
    () => crossSensorRatio(monthlyMatrix(years.modis, 2), monthlyMatrix(years["viirs-snpp"], 2)),
    [years],
  );

  if (!country)
    return (
      <p className="rounded border border-border p-3 text-sm text-muted-foreground">
        Select a country (search box or globe) to explore its long-term NASA archive: MODIS 2000–{ARCHIVE_LAST_YEAR}, VIIRS S-NPP 2012–{ARCHIVE_LAST_YEAR}.
      </p>
    );

  const load = async (sensors: ArchiveSensor[]) => {
    const id = ++run.current;
    setBusy(true);
    const jobs = sensors.flatMap((sn) =>
      Array.from({ length: ARCHIVE_LAST_YEAR - ARCHIVE_SENSORS[sn].firstYear + 1 }, (_, i) => ({ sn, y: ARCHIVE_LAST_YEAR - i })).filter(
        ({ sn: s, y }) => useFire.getState().archive.country !== country || useFire.getState().archive.years[s][y]?.status !== "ok",
      ),
    );
    for (const j of jobs) setYear(country, j.sn, j.y, { status: "pending" });
    const worker = async () => {
      while (jobs.length && run.current === id) {
        const j = jobs.shift()!;
        setYear(country, j.sn, j.y, { status: "loading" });
        try {
          const r = await fetchYear({ data: { sensor: j.sn, year: j.y, country: firmsCountryName(country) } });
          setYear(country, j.sn, j.y, r.ok ? { status: "ok", summary: r.summary } : { status: r.status, message: r.message });
        } catch {
          setYear(country, j.sn, j.y, { status: "error", message: "Archive proxy unreachable." });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (run.current === id) setBusy(false);
  };

  const openOnGlobe = (y: number, m: number) => {
    const f = countryFeature(country);
    if (!f) return;
    const [[w, s], [e, n]] = geoBounds(f);
    const r = (v: number) => Math.round(v * 10) / 10;
    const monthEnd = addDays(`${y}-${String(m + 2).padStart(2, "0")}-01`.replace(/-13-/, "-12-").replace(/^(\d+)-12-01$/, `${y}-12-31`), m === 11 ? 0 : -1);
    const end = monthEnd > todayUtc() ? todayUtc() : monthEnd;
    set({
      mode: "live",
      live: { source: sensor === "modis" ? "MODIS_SP" : "VIIRS_SNPP_SP", region: `bbox:${r(Math.max(-180, w))},${r(s)},${r(Math.min(180, e))},${r(n)}`, endDate: end, days: 10 },
    });
  };

  const st = years[sensor];
  const counts = { ok: 0, unavailable: 0, error: 0, loading: 0 };
  for (const y of allYears) {
    const s = st[y]?.status;
    if (s === "ok") counts.ok++;
    else if (s === "unavailable") counts.unavailable++;
    else if (s === "error") counts.error++;
    else if (s === "loading" || s === "pending") counts.loading++;
  }
  const dailySel = selY != null && st[selY]?.status === "ok" ? (st[selY] as { summary: { days: Record<string, [number, number, number]> } }).summary.days : null;
  const dayMax = dailySel ? Math.max(1, ...Object.values(dailySel).map((a) => a[metric])) : 1;
  const compareRows = MONTHS.map((l, m) => ({
    l,
    [String(selY)]: selY != null ? matrix.get(selY)?.[m] ?? null : null,
    ...(cmp != null ? { [String(cmp)]: matrix.get(cmp)?.[m] ?? null } : {}),
    mean: okYears.length ? okYears.reduce((a, y) => a + matrix.get(y)![m]!, 0) / okYears.length : null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Seg label="Sensor" options={(Object.keys(ARCHIVE_SENSORS) as ArchiveSensor[]).map((v) => ({ v, l: ARCHIVE_SENSORS[v].short }))} value={sensor} onChange={setSensor} />
        <Seg label="Metric" options={([2, 1, 0] as Metric[]).map((v) => ({ v, l: ["Raw", "Vegetation", "Harmonized"][v]! }))} value={metric} onChange={setMetric} />
        <button
          disabled={busy}
          onClick={() => load(["modis", "viirs-snpp"])}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? `Loading NASA archive… (${counts.loading} years left)` : counts.ok ? "Reload missing years" : `Load ${country} archive (MODIS + VIIRS)`}
        </button>
        <span className="font-mono text-[11px] text-muted-foreground" data-testid="archive-status">
          {ARCHIVE_SENSORS[sensor].short}: {counts.ok}/{allYears.length} years retrieved · {counts.unavailable} unavailable · {counts.error} failed
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Metric: <b className="text-foreground">{METRIC_LABELS[metric]}</b>.{" "}
        {metric === 2
          ? "Unique 0.05° (~5 km) grid cells with ≥1 confident vegetation-fire detection per UTC day — removes duplicate overpasses/pixels so MODIS and VIIRS are more comparable. Still an index, not a count of fires."
          : metric === 1
            ? "Rows with type 0 (presumed vegetation fire) and nominal/high confidence; excludes volcanoes, static industrial sources and offshore flares."
            : "Every archive row, including static/industrial sources and duplicate overpasses."}{" "}
        Source: NASA FIRMS yearly country archive ({ARCHIVE_SENSORS[sensor].label}, {ARCHIVE_SENSORS[sensor].resolution}). {new Date().getUTCFullYear()} is not yet archived — use the live view above for recent days.
      </p>

      {/* Year × month calendar */}
      <div className="overflow-x-auto">
        <table className="text-[10px]" data-testid="archive-matrix">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pr-2 text-left font-normal">Year</th>
              {MONTHS.map((m) => <th key={m} className="w-9 font-normal">{m}</th>)}
              <th className="pl-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {allYears.slice().reverse().map((y) => {
              const row = matrix.get(y);
              const ys = st[y];
              return (
                <tr key={y}>
                  <td className="pr-2">{y}</td>
                  {MONTHS.map((_, m) => {
                    const v = row?.[m] ?? 0;
                    const t = Math.log1p(v) / Math.log1p(max);
                    const isSel = sel?.y === y && sel.m === m;
                    return (
                      <td key={m} className="p-px">
                        <button
                          disabled={!row}
                          onClick={() => setSel({ y, m })}
                          title={row ? `${MONTHS[m]} ${y}: ${v.toLocaleString()}` : `${y}: ${ys && "message" in ys ? ys.message : "not retrieved"}`}
                          className={cn("block h-4 w-9 rounded-sm", isSel && "ring-1 ring-foreground", !row && "archive-missing")}
                          style={row ? { background: v === 0 ? "var(--muted)" : heat(t), opacity: v === 0 ? 1 : 0.35 + 0.65 * t } : undefined}
                        />
                      </td>
                    );
                  })}
                  <td className="pl-2 text-right text-muted-foreground">
                    {row ? row.reduce((a, b) => a + b, 0).toLocaleString() : ys?.status === "loading" ? "…" : ys && "message" in ys ? ys.status : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-muted" /> zero in retrieved archive</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--fire)]" /> higher (log scale)</span>
          <span className="flex items-center gap-1"><span className="archive-missing h-2.5 w-2.5 rounded-sm" /> year not retrieved / unavailable</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="mb-1 text-xs font-semibold">Daily calendar — {selY ?? "—"}</h3>
          {dailySel && selY != null ? (
            <div className="space-y-px font-mono text-[9px]">
              {MONTHS.map((ml, m) => (
                <div key={ml} className="flex items-center gap-px">
                  <span className="w-7 text-muted-foreground">{ml}</span>
                  {Array.from({ length: new Date(Date.UTC(selY, m + 1, 0)).getUTCDate() }, (_, d) => {
                    const k = `${selY}-${String(m + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
                    const v = dailySel[k]?.[metric] ?? 0;
                    const t = Math.log1p(v) / Math.log1p(dayMax);
                    return <span key={k} title={`${k}: ${v}`} className="block h-2.5 w-2.5 rounded-[1px]" style={{ background: v ? heat(t) : "var(--muted)", opacity: v ? 0.35 + 0.65 * t : 1 }} />;
                  })}
                </div>
              ))}
              <p className="pt-1 font-sans text-[11px] text-muted-foreground">Archive files list detections only; a day with no rows is shown as zero. NASA does not mark individual missing orbits in these files.</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Load the archive and select a year in the calendar.</p>
          )}
        </section>
        <section>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Compare years by month</h3>
            <label className="text-[11px] text-muted-foreground">
              vs{" "}
              <select className="rounded border border-input bg-background px-1 py-0.5 text-foreground" value={cmp ?? ""} onChange={(e) => setCmp(e.target.value ? Number(e.target.value) : null)}>
                <option value="">—</option>
                {okYears.filter((y) => y !== selY).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          {okYears.length ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={compareRows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="l" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line dataKey="mean" name={`${okYears.length}-yr mean`} stroke="var(--muted-foreground)" strokeDasharray="4 3" dot={false} />
                  <Line dataKey={String(selY)} stroke="var(--fire)" dot={false} strokeWidth={2} />
                  {cmp != null && <Line dataKey={String(cmp)} stroke="var(--amber)" dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No retrieved years yet.</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-border p-3" data-testid="archive-anomaly">
          <h3 className="text-xs font-semibold">Unusual activity — {sel ? `${MONTHS[sel.m]} ${sel.y}` : "select a month"}</h3>
          {an ? (
            <div className="mt-1 space-y-1 text-xs">
              <div className="flex flex-wrap gap-x-4 font-mono">
                <span>observed {an.observed.toLocaleString()}</span>
                <span>baseline {an.baselineMean?.toFixed(0) ?? "—"}</span>
                <span>z {an.z == null ? "—" : Number.isFinite(an.z) ? an.z.toFixed(2) : "∞"}</span>
                <span className={an.status === "strong" ? "text-destructive" : an.status === "elevated" ? "text-[var(--amber)]" : "text-muted-foreground"}>{an.status === "insufficient" ? "Insufficient historical data" : an.status}</span>
              </div>
              <p className="text-muted-foreground">{an.reason}</p>
              {an.baselineYears.length > 0 && <p className="text-[11px] text-muted-foreground">Baseline: same calendar month in {an.baselineYears[0]}–{an.baselineYears[an.baselineYears.length - 1]} ({an.baselineYears.length} years, {ARCHIVE_SENSORS[sensor].short} only). Statistical indicator, not an official warning or forecast.</p>}
              <button onClick={() => openOnGlobe(sel!.y, sel!.m)} className="mt-1 rounded border border-border px-2 py-0.5 hover:bg-muted">
                Load last 10 days of {MONTHS[sel!.m]} {sel!.y} on the globe ({sensor === "modis" ? "MODIS" : "VIIRS"} Standard)
              </button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Click a month cell. Flags need ≥10 other retrieved years for the same month.</p>
          )}
        </section>
        <section className="rounded border border-border p-3">
          <h3 className="text-xs font-semibold">Historically recurring critical periods</h3>
          {peaks == null ? (
            <p className="mt-1 text-xs text-muted-foreground">Insufficient historical data (≥5 retrieved years needed).</p>
          ) : peaks.length ? (
            <ul className="mt-1 space-y-0.5 text-xs">
              {peaks.map((p) => (
                <li key={p.month} className="flex justify-between font-mono">
                  <span className="font-sans">{MONTHS[p.month]}</span>
                  <span className="text-[var(--amber)]">{p.ratio.toFixed(1)}× avg month · top-3 in {Math.round(p.share * 100)}% of years</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">No month recurs as a clear peak season.</p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">Months whose long-term mean is ≥1.5× the average month and that rank in the year's top 3 in at least half of years. A historical pattern — not a prediction.</p>
        </section>
      </div>

      {ratio.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold">Cross-sensor check (harmonized cells, overlap years)</h3>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
            {ratio.map((r) => <span key={r.year}>{r.year}: VIIRS/MODIS {r.ratio?.toFixed(2) ?? "—"}</span>)}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">VIIRS detects smaller fires, so ratios above 1 are expected. Series are shown per sensor and never spliced; long-term trends use MODIS alone for consistency.</p>
        </section>
      )}
    </div>
  );
}
