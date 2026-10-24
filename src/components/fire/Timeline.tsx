import { useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useFire, useFilteredData, scopeKey } from "@/lib/fire/store";
import { windowDates } from "@/lib/fire/analytics";
import { fmtDate } from "@/lib/fire/dates";
import { cn } from "@/lib/utils";

export function Timeline() {
  const data = useFilteredData();
  const country = useFire((s) => s.country);
  const date = useFire((s) => s.selectedDate);
  const W = useFire((s) => s.windowDays);
  const playing = useFire((s) => s.playing);
  const speed = useFire((s) => s.speed);
  const set = useFire((s) => s.set);
  const dates = data?.ds.dates ?? [];
  const idx = date ? dates.indexOf(date) : -1;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const s = useFire.getState();
      const ds = s.data?.ds.dates ?? [];
      const i = s.selectedDate ? ds.indexOf(s.selectedDate) : -1;
      if (i < 0 || i >= ds.length - 1) s.set({ playing: false });
      else s.set({ selectedDate: ds[i + 1] ?? null });
    }, 900 / speed);
    return () => clearInterval(t);
  }, [playing, speed]);

  const bars = useMemo(() => {
    if (!data) return [];
    const all = data.idx.get(scopeKey(country));
    return dates.map((d) => ({ d, n: all?.get(d) ?? 0, missing: data.missing.has(d) }));
  }, [data, dates, country]);
  const max = Math.max(1, ...bars.map((b) => b.n));
  const inWin = useMemo(() => new Set(date ? windowDates(date, W) : []), [date, W]);

  if (!data || !date) return <div className="h-28 animate-pulse rounded-lg border border-border bg-card" />;
  const go = (i: number) => set({ selectedDate: dates[Math.max(0, Math.min(dates.length - 1, i))] ?? null });

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <CtlBtn label="Previous day" onClick={() => go(idx - 1)} disabled={idx <= 0}>
            <ChevronLeft className="h-4 w-4" />
          </CtlBtn>
          <button
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => {
              if (!playing && idx >= dates.length - 1) go(0);
              set({ playing: !playing });
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-fire)]"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <CtlBtn label="Next day" onClick={() => go(idx + 1)} disabled={idx >= dates.length - 1}>
            <ChevronRight className="h-4 w-4" />
          </CtlBtn>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Selected window (UTC)</div>
          <div className="truncate text-sm font-semibold" data-testid="selected-date">
            {W > 1 ? `${fmtDate(windowDates(date, W)[0]!)} → ` : ""}
            {fmtDate(date)}
            <span className="ml-2 font-normal text-muted-foreground">00:00–23:59</span>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Seg label="Speed" options={[1, 2, 5].map((v) => ({ v, l: `${v}×` }))} value={speed} onChange={(v) => set({ speed: v })} />
          <Seg
            label="Window"
            options={[1, 7, 30].map((v) => ({ v, l: `${v}d`, disabled: v > dates.length }))}
            value={W}
            onChange={(v) => set({ windowDays: v })}
          />
        </div>
      </div>

      <div className="mt-3">
        <svg viewBox={`0 0 ${bars.length} 40`} preserveAspectRatio="none" className="h-12 w-full" aria-label="Detections per day">
          {bars.map((b, i) => (
            <g key={b.d} onClick={() => go(i)} className="cursor-pointer">
              <title>{`${b.d}: ${b.missing ? "no observations available" : `${b.n} detections`}`}</title>
              <rect x={i} y={0} width={1} height={40} fill="transparent" />
              {b.missing ? (
                <rect x={i + 0.1} y={30} width={0.8} height={10} fill="var(--missing)" />
              ) : (
                <rect
                  x={i + 0.1}
                  y={40 - Math.max(0.8, (b.n / max) * 38)}
                  width={0.8}
                  height={Math.max(0.8, (b.n / max) * 38)}
                  fill={inWin.has(b.d) ? "var(--fire)" : "var(--bar)"}
                />
              )}
            </g>
          ))}
        </svg>
        <Slider className="mt-1" min={0} max={Math.max(0, dates.length - 1)} step={1} value={[idx]} onValueChange={([v]) => go(v!)} aria-label="Select date" />
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>{fmtDate(dates[0]!)}</span>
          <span className="hidden sm:inline">
            <span className="mr-1 inline-block h-2 w-2 bg-[var(--missing)]" /> no observations available
          </span>
          <span>{fmtDate(dates[dates.length - 1]!)}</span>
        </div>
      </div>
    </div>
  );
}

function CtlBtn({ label, children, ...p }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" {...p}>
      {children}
    </button>
  );
}

export function Seg<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { v: T; l: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>}
      <div className="flex rounded-md border border-border p-0.5">
        {options.map((o) => (
          <button
            key={String(o.v)}
            disabled={o.disabled}
            onClick={() => onChange(o.v)}
            className={cn(
              "rounded px-2 py-0.5 text-xs disabled:opacity-30",
              value === o.v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
