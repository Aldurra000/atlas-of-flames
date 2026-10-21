import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { CountrySelect } from "@/components/fire/CountrySelect";
import { ActivityChart } from "@/components/fire/Charts";
import { Timeline } from "@/components/fire/Timeline";
import { useFire, useWindowData } from "@/lib/fire/store";
import { computeAnomaly } from "@/lib/fire/analytics";
import { countryFeature } from "@/lib/fire/geo";

export const Route = createFileRoute("/country")({
  head: () => ({
    meta: [
      { title: "Country Intelligence — FIRECHRONICLE" },
      { name: "description", content: "Per-country active-fire detections, seasonality, baseline anomalies and data coverage." },
      { property: "og:title", content: "Country Intelligence — FIRECHRONICLE" },
      { property: "og:description", content: "Country-level satellite fire activity and official agency links." },
    ],
  }),
  component: CountryPage,
});

// Official organizations (public websites only; no contact details reproduced).
const AGENCIES: Record<string, { name: string; url: string }[]> = {
  "United States of America": [{ name: "National Interagency Fire Center", url: "https://www.nifc.gov" }],
  Canada: [{ name: "Canadian Interagency Forest Fire Centre", url: "https://ciffc.ca" }],
  Australia: [{ name: "Bureau of Meteorology", url: "https://www.bom.gov.au" }],
  Brazil: [{ name: "INPE — Programa Queimadas", url: "https://terrabrasilis.dpi.inpe.br/queimadas/portal/" }],
  Portugal: [{ name: "ICNF", url: "https://www.icnf.pt" }],
  Greece: [{ name: "Hellenic Fire Service", url: "https://www.fireservice.gr" }],
};
const GLOBAL = [
  { name: "Global Wildfire Information System (GWIS)", url: "https://gwis.jrc.ec.europa.eu" },
  { name: "NASA FIRMS", url: "https://firms.modaps.eosdis.nasa.gov" },
];

function CountryPage() {
  const country = useFire((s) => s.country);
  const data = useFire((s) => s.data);
  const date = useFire((s) => s.selectedDate);
  const W = useFire((s) => s.windowDays);
  const cfg = useFire((s) => s.anomaly);
  const set = useFire((s) => s.set);
  const win = useWindowData();
  const map = useMemo(() => {
    const f = country ? countryFeature(country) : null;
    if (!f || !win) return null;
    const proj = geoMercator().fitSize([600, 380], f);
    return { d: geoPath(proj)(f) ?? "", pts: win.records.slice(0, 5000).map((r) => ({ r, p: proj([r.lon, r.lat]) })) };
  }, [country, win]);
  const anomaly = country && data && date ? computeAnomaly(data.idx.get(country), data.available, date, W, cfg) : null;
  const products = [...new Set(win?.records.map((r) => `${r.instrument} ${r.satellite ?? ""}`) ?? [])];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Country Intelligence{country ? ` — ${country}` : ""}</h1>
        <CountrySelect />
      </div>
      <Timeline />
      {!country ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Search for a country above or click one on the globe.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Hotspot distribution · {win?.records.length.toLocaleString()} detections</h2>
            {map ? (
              <svg viewBox="0 0 600 380" className="mt-2 w-full">
                <path d={map.d} fill="var(--secondary)" stroke="var(--muted-foreground)" strokeWidth={0.6} />
                {map.pts.map(({ r, p }) => p && <circle key={r.id} cx={p[0]} cy={p[1]} r={2} fill="var(--fire)" opacity={0.75} className="cursor-pointer" onClick={() => set({ selection: { type: "detection", detection: r } })} />)}
              </svg>
            ) : <p className="text-sm text-muted-foreground">Boundary unavailable.</p>}
            {win && !win.records.length && <p className="text-sm text-muted-foreground">No detections in this window (or data unavailable for this country).</p>}
          </section>
          <section className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Daily activity</h2>
              <ActivityChart scope={country} gran="daily" height={150} />
              <h2 className="mt-3 text-sm font-semibold">Seasonal profile (mean / observed day)</h2>
              <ActivityChart scope={country} gran="seasonal" height={130} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <h2 className="font-semibold">Baseline comparison</h2>
              <p className="mt-1 text-muted-foreground">{anomaly?.reason}</p>
              <p className="mt-2 text-xs text-muted-foreground">Coverage {Math.round((win?.coverage ?? 0) * 100)}% · Products: {products.join(", ") || "—"}</p>
              <h2 className="mt-3 font-semibold">Official organizations</h2>
              <ul className="mt-1 space-y-1 text-xs">
                {[...(AGENCIES[country] ?? []), ...GLOBAL].map((a) => (
                  <li key={a.url}><a href={a.url} target="_blank" rel="noreferrer" className="text-[var(--amber)] hover:underline">{a.name}</a></li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">Links only. FIRECHRONICLE is not connected to any emergency dispatch system.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
