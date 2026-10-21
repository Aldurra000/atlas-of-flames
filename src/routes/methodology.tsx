import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — FIRECHRONICLE" },
      { name: "description", content: "How FIRECHRONICLE normalizes NASA FIRMS data, aggregates, builds baselines and flags anomalies." },
      { property: "og:title", content: "Methodology — FIRECHRONICLE" },
      { property: "og:description", content: "Data sources, definitions, methods and limitations." },
    ],
  }),
  component: Methodology,
});

const S = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section className="border-t border-border py-5">
    <h2 className="mb-2 text-lg font-semibold">{t}</h2>
    <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

function Methodology() {
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Methodology & Data Transparency</h1>
      <S t="Data source">
        <p>NASA FIRMS active-fire products (MODIS 1 km, VIIRS 375 m; NRT and Standard), retrieved through a server-side proxy using the FIRMS area API. The key is held server-side only. Requests are limited to 10 days and 20,000 detections. Demo mode uses synthetic records generated in the browser and is always labeled.</p>
      </S>
      <S t="Detections vs fires vs burned area">
        <p>A detection is one satellite pixel flagged as containing at least one thermal anomaly during an overpass. One fire can produce many detections across pixels and overpasses; detection counts are not unique fire counts. Burned area requires different products (e.g. MCD64A1) which are not integrated.</p>
      </S>
      <S t="Normalization">
        <p>Each CSV row becomes a common record: lat/lon, acquisition date/time (UTC), product, instrument, satellite, confidence (VIIRS l/n/h; MODIS 0–100 mapped to low &lt;30, nominal &lt;80, high), brightness (VIIRS bright_ti4 / MODIS brightness), secondary brightness (bright_ti5 / bright_t31), FRP, day/night, scan, track, version. Original fields are preserved. Countries are assigned by point-in-polygon against Natural Earth 1:110m boundaries; coastal points may be unassigned. MODIS and VIIRS differ in resolution and sensitivity; counts from different products should not be compared directly.</p>
      </S>
      <S t="Aggregation & visualization">
        <p>Detections are binned into a regular lat/lon grid whose size depends on zoom (e.g. 2°, 0.5°, individual). Flame, column and heat symbols encode detection counts only — their size, color and motion are not physical fire measurements.</p>
      </S>
      <S t="Baselines & anomalies">
        <p>For a region and window of W days, the observed count is compared with the K = 8 preceding non-overlapping W-day windows. Windows with less than 80% of days available are excluded; partial windows are scaled. At least 4 valid baseline windows are required, otherwise the result is "Insufficient historical data". z = (observed − mean) / max(std, √mean, 1). A window is flagged elevated at z ≥ 2 and strong at z ≥ 3, with at least 10 detections. Thresholds are configurable in Historical Analysis. This trailing baseline does not model multi-year seasonality; a seasonal ramp-up can be flagged.</p>
      </S>
      <S t="Monitoring priorities">
        <p>score = 0.4·R + 0.3·P + 0.3·A (recent activity, persistence, anomaly). This is a monitoring aid, not a forecast. No weather, drought, vegetation or official-warning data is integrated.</p>
      </S>
      <S t="Coverage & limitations">
        <p>Days with no observations retrieved are shown as missing, distinct from zero detections. Clouds, overpass timing, smoke and sensor saturation affect detection. NRT data may be incomplete for the latest day. Short live ranges cannot support baselines.</p>
      </S>
    </article>
  );
}
