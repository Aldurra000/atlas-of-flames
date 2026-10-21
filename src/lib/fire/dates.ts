export const toUtc = (s: string) => new Date(`${s}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const todayUtc = () => iso(new Date());
export function addDays(s: string, n: number) {
  const d = toUtc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export function dateRange(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
export const daysBetween = (a: string, b: string) =>
  Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86400000);
export function fmtDate(s: string) {
  return toUtc(s).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
export const fmtShort = (s: string) =>
  toUtc(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
export const isoWeekKey = (s: string) => {
  const d = toUtc(s);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return iso(d);
};
