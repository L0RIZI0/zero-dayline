import type { TickMark, TickUnit } from "./types";
import { addUnit, floorTo, formatTickLabel, unitApproxMs } from "./time";

type Level = { unit: TickUnit; step: number; major: boolean; label: boolean };
export type LabelLane = "year" | "month" | "day" | "time";

const LEVELS: Level[] = [
  { unit: "year", step: 10, major: true, label: true },
  { unit: "year", step: 5, major: true, label: true },
  { unit: "year", step: 1, major: true, label: true },
  { unit: "month", step: 3, major: true, label: true },
  { unit: "month", step: 1, major: true, label: true },
  { unit: "week", step: 1, major: true, label: true },
  { unit: "day", step: 1, major: true, label: true },
  { unit: "hour", step: 12, major: true, label: true },
  { unit: "hour", step: 6, major: true, label: true },
  { unit: "hour", step: 3, major: true, label: true },
  { unit: "hour", step: 1, major: true, label: true },
  { unit: "minute", step: 30, major: false, label: true },
  { unit: "minute", step: 15, major: false, label: true },
  { unit: "minute", step: 5, major: false, label: false },
];

export function labelLane(unit: TickUnit): LabelLane {
  if (unit === "year") return "year";
  if (unit === "month") return "month";
  if (unit === "hour" || unit === "minute") return "time";
  return "day";
}

/** Extra px past the canvas so a vis-centered day name can bleed off instead of popping. */
const DAY_BLEED = 120;

function labelMinPx(unit: TickUnit, spanMs: number): number {
  if (unit === "hour" && spanMs < 2 * 86_400_000) return 28;
  if (unit === "hour") return 44;
  if (unit === "minute") return 44;
  if (unit === "day" && spanMs < 12 * 86_400_000) return 48;
  return 64;
}

export function buildTicks(
  tLeft: number,
  tRight: number,
  spanMs: number,
  timeToX: (t: number) => number,
  width: number,
  measure: (label: string) => number,
): TickMark[] {
  const padT = spanMs * 0.08;
  const a = tLeft - padT;
  const b = tRight + padT;
  const ticks: TickMark[] = [];
  const usedLabel: Record<LabelLane, { x0: number; x1: number }[]> = {
    year: [], month: [], day: [], time: [],
  };
  const usedMajorX: number[] = [];
  const collides = (lane: LabelLane, x0: number, x1: number) =>
    usedLabel[lane].some((u) => x0 < u.x1 && x1 > u.x0);

  for (const level of LEVELS) {
    const approx = unitApproxMs(level.unit, level.step);
    const avgPx = (approx / spanMs) * width;
    if (avgPx < 3 && level.unit !== "year") continue;
    if (avgPx > width * 1.8 && !(level.unit === "day" && level.step === 1)) continue;
    if (level.unit === "week") {
      const dayPx = (unitApproxMs("day", 1) / spanMs) * width;
      if (dayPx >= labelMinPx("day", spanMs) * 0.6) continue;
    }
    const lane = labelLane(level.unit);
    let t = floorTo(a, level.unit, level.step);
    let guard = 0;
    while (t <= b && guard++ < 5000) {
      const isDay = level.unit === "day" && level.step === 1;
      const xTick = timeToX(t);
      let x = xTick;
      let vis0 = 0;
      let vis1 = 0;
      let xDay0 = xTick;
      let xDay1 = xTick;
      if (isDay) {
        xDay0 = xTick;
        xDay1 = timeToX(t + approx);
        vis0 = Math.max(xDay0, -DAY_BLEED);
        vis1 = Math.min(xDay1, width + DAY_BLEED);
        x = vis1 > vis0 ? (vis0 + vis1) * 0.5 : xTick;
      }
      if ((xTick >= -80 && xTick <= width + 80) || (isDay && vis1 > vis0)) {
        const localPx = isDay ? Math.abs(xDay1 - xDay0) : Math.abs(timeToX(t + approx) - xTick);
        const room = level.major ? 7 : 3.5;
        if (localPx >= room || isDay) {
          const tooCloseMajor = !isDay && usedMajorX.some((mx) => Math.abs(mx - xTick) < 6);
          if (!tooCloseMajor) {
            let label: string | undefined;
            let labelWidth = 0;
            const minPx = labelMinPx(level.unit, spanMs);
            if (level.label && (isDay || localPx >= minPx)) {
              const text = formatTickLabel(t, level.unit, spanMs);
              const w = measure(text);
              const pad = lane === "time" ? 5 : 7;
              const half = w * 0.5 + pad;
              const overlaps = x + w * 0.5 > -2 && x - w * 0.5 < width + 2;
              if (overlaps) {
                const x0 = x - half;
                const x1 = x + half;
                const nearEdge = isDay && (x < half || x > width - half);
                const c0 = isDay ? Math.max(x0, 0) : x0;
                const c1 = isDay ? Math.min(x1, width) : x1;
                if (nearEdge || !collides(lane, c0, c1)) {
                  label = text;
                  labelWidth = w;
                  if (!nearEdge) usedLabel[lane].push({ x0: c0, x1: c1 });
                }
              }
            }
            if (isDay) {
              if (xTick >= -80 && xTick <= width + 80) {
                ticks.push({ t, x: xTick, unit: "day", major: true, boundary: true, drawTick: true, labelWidth: 0 });
              }
              if (label) ticks.push({ t, x, unit: "day", major: false, drawTick: false, label, labelWidth });
            } else {
              const near = ticks.find((tk) => tk.drawTick !== false && Math.abs(tk.x - xTick) < 4);
              if (near) {
                if (label) ticks.push({ t, x, unit: level.unit, major: false, drawTick: false, label, labelWidth });
              } else {
                ticks.push({ t, x: xTick, unit: level.unit, major: level.major && localPx >= 16, label, labelWidth, drawTick: true });
                if (level.major) usedMajorX.push(xTick);
              }
            }
          }
        }
      }
      t = addUnit(t, level.unit, level.step);
    }
  }
  ticks.sort((p, q) => p.x - q.x);
  return ticks;
}

export function coilUnit(spanMs: number): { unit: TickUnit; step: number } {
  const day = 86_400_000;
  const hour = 3_600_000;
  if (spanMs < 3 * hour) return { unit: "minute", step: 5 };
  if (spanMs < 16 * hour) return { unit: "minute", step: 15 };
  if (spanMs < 3 * day) return { unit: "hour", step: 1 };
  if (spanMs < 16 * day) return { unit: "hour", step: 3 };
  if (spanMs < 50 * day) return { unit: "hour", step: 12 };
  if (spanMs < 200 * day) return { unit: "day", step: 1 };
  if (spanMs < 800 * day) return { unit: "week", step: 1 };
  return { unit: "month", step: 1 };
}
