// OWNER: impact. Pure helpers shared by the server and the page (no server imports, safe in the browser).
import type { ImpactRange } from "./impact";

export const DISCLAIMER = "Past reactions are not a forecast. Not investment advice.";
export const fmtPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(n)}%`;

export function rangeOf(moves: number[]): ImpactRange | null {
  if (moves.length === 0) return null;
  const v = [...moves].sort((a, b) => a - b);
  const mid = v.length >> 1;
  const median = v.length % 2 ? v[mid] : Math.round(((v[mid - 1] + v[mid]) / 2) * 100) / 100;
  return { min: v[0], max: v[v.length - 1], median, n: v.length };
}
export const rangeLine = (r: ImpactRange | null) =>
  !r
    ? "No comparable case with a verified next-day stock move was found, so no range is shown."
    : r.n === 1
      ? `In 1 comparable case the stock moved ${fmtPct(r.min)} the next trading day.`
      : `In ${r.n} comparable cases the stock moved between ${fmtPct(r.min)} and ${fmtPct(r.max)} the next trading day (median ${fmtPct(r.median)}).`;
