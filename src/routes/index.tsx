import { createFileRoute, Link } from "@tanstack/react-router";
import { GlobePanel } from "@/components/fire/GlobePanel";
import { Timeline } from "@/components/fire/Timeline";
import { AlertBanner } from "@/components/fire/AlertCenter";
import { MetricsBar, Ranking, useAnomalyFlags } from "@/components/fire/Metrics";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "FIRECHRONICLE — Global Fire Overview" },
      { name: "description", content: "Interactive 3D Earth of satellite active-fire detections with timeline, rankings and anomaly flags." },
      { property: "og:title", content: "FIRECHRONICLE — Global Fire Overview" },
      { property: "og:description", content: "Understand the past. Monitor the present. Prepare for what comes next." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const flags = useAnomalyFlags();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Global Overview</h1>
          <p className="text-sm text-muted-foreground">Understand the Past. Monitor the Present. Prepare for What Comes Next.</p>
        </div>
      </div>
      <MetricsBar />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <AlertBanner />
          <GlobePanel className="h-[58vh] min-h-[380px]" />
          <Timeline />
        </div>
        <div className="space-y-4">
          <Ranking />
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Unusual activity</h3>
            {flags?.insufficient ? (
              <p className="mt-1 text-xs text-muted-foreground">Insufficient historical data for baseline comparison in the loaded range.</p>
            ) : flags?.flagged.length ? (
              <ul className="mt-2 space-y-2 text-xs">
                {flags.flagged.slice(0, 5).map((f) => (
                  <li key={f.country} className="flex justify-between">
                    <span>{f.country}</span>
                    <span className="font-mono text-[var(--amber)]">z {f.a.z?.toFixed(1)} · {f.a.ratio?.toFixed(1)}×</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No region exceeds the baseline threshold in this window.</p>
            )}
            <Link to="/history" className="mt-3 inline-block text-xs text-[var(--amber)] hover:underline">
              Historical analysis →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
