/** Rise/set for Lausanne (46.52°N, 6.63°E). Decorative, not ephemeris-grade. */

import { DAY, HOUR, startOfDay } from "./time";

const LAT = (46.5198 * Math.PI) / 180;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0);
/** Mean time between lunar transits (~24h 50.5m). */
const LUNAR_DAY = 24.841666 * HOUR;
const TROPICAL_MONTH = 27.321661 * DAY;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

const _slot: { sod: number; v: { rise: number; set: number } }[] = [];
const _moon: { k: number; v: { rise: number; set: number; transit: number } }[] = [];

/** Day-length fraction 0–1. */
export function dayLengthFrac(ms: number): number {
  const date = new Date(ms);
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (ms - start) / 86_400_000;
  const dec = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (doy - 81)) / 365.25);
  const x = -Math.tan(LAT) * Math.tan(dec);
  const a = Math.acos(clamp(x, -1, 1));
  return (2 * a) / (2 * Math.PI);
}

export function sunTimes(ms: number): { rise: number; set: number } {
  const sod = startOfDay(ms);
  for (let i = 0; i < _slot.length; i++) if (_slot[i].sod === sod) return _slot[i].v;
  const frac = clamp(dayLengthFrac(sod + 12 * HOUR), 0.2, 0.84);
  const half = (frac * DAY) / 2;
  const noon = sod + 12 * HOUR + 80 * 60 * 1000;
  const v = { rise: noon - half, set: noon + half };
  if (_slot.length >= 6) _slot.shift();
  _slot.push({ sod, v });
  return v;
}

/** 0 at knots, 1 at mid. */
export function sunHeight(u: number): number {
  return Math.sin(Math.PI * clamp(u, 0, 1));
}

export function sunUnit(t: number): number {
  const { rise, set } = sunTimes(t);
  if (t < rise) {
    const prev = sunTimes(t - DAY);
    const dayW = Math.max(1, prev.set - prev.rise);
    const nightW = Math.max(1, rise - prev.set);
    return -(nightW / dayW) * sunHeight((t - prev.set) / nightW);
  }
  const dayW = Math.max(1, set - rise);
  if (t <= set) return sunHeight((t - rise) / dayW);
  const next = sunTimes(t + DAY);
  const nightW = Math.max(1, next.rise - set);
  return -(nightW / dayW) * sunHeight((t - set) / nightW);
}

/** −1 winter solstice, +1 summer. */
export function seasonSigned(ms: number): number {
  return clamp((dayLengthFrac(ms) - 0.5) / 0.18, -1, 1);
}

function moonKFloor(t: number): number {
  return Math.floor((t - NEW_MOON) / LUNAR_DAY);
}

function passageK(k: number): { k: number; rise: number; set: number; transit: number } {
  for (let i = 0; i < _moon.length; i++) if (_moon[i].k === k) return { k, ..._moon[i].v };
  const transit = NEW_MOON + k * LUNAR_DAY;
  const dec = Math.sin((2 * Math.PI * (transit - NEW_MOON)) / TROPICAL_MONTH);
  const up = (12.15 + dec * 1.35) * HOUR;
  const v = { rise: transit - up / 2, set: transit + up / 2, transit };
  if (_moon.length >= 10) _moon.shift();
  _moon.push({ k, v });
  return { k, ...v };
}

/** Passage whose rise/set window contains `t` (or the night after its set). */
export function moonPassage(t: number): { rise: number; set: number; transit: number } {
  let k = moonKFloor(t);
  let p = passageK(k);
  if (t < p.rise) p = passageK(k - 1);
  const next = passageK(p.k + 1);
  if (t >= next.rise) p = next;
  return p;
}

export function moonTimes(ms: number): { rise: number; set: number } {
  const p = moonPassage(ms);
  return { rise: p.rise, set: p.set };
}

/**
 * Same knot rule as the sun: 0 at moonrise / moonset, + when the moon is up,
 * − when it's down. C1 at the knots (matching sunUnit).
 */
export function moonUnit(t: number): number {
  let k = moonKFloor(t);
  let p = passageK(k);
  if (t < p.rise) p = passageK(k - 1);
  let next = passageK(p.k + 1);
  if (t >= next.rise) {
    p = next;
    next = passageK(p.k + 1);
  }
  const upW = Math.max(1, p.set - p.rise);
  if (t <= p.set) return sunHeight((t - p.rise) / upW);
  const downW = Math.max(1, next.rise - p.set);
  return -(downW / upW) * sunHeight((t - p.set) / downW);
}

/** Extra sample times so the polyline hits the axis at rise/set. */
export function sunKnots(tL: number, tR: number): number[] {
  const out: number[] = [];
  const d0 = startOfDay(tL - DAY);
  const d1 = startOfDay(tR) + DAY;
  const dMax = d0 + 16 * DAY;
  for (let d = d0; d <= d1 && d <= dMax; d += DAY) {
    const { rise, set } = sunTimes(d);
    out.push(rise, (rise + set) / 2, set);
  }
  return out;
}

export function moonKnots(tL: number, tR: number): number[] {
  const out: number[] = [];
  const k0 = moonKFloor(tL) - 1;
  const k1 = Math.min(moonKFloor(tR) + 1, k0 + 16);
  for (let k = k0; k <= k1; k++) {
    const p = passageK(k);
    const next = passageK(k + 1);
    out.push(p.rise, p.transit, p.set, (p.set + next.rise) / 2);
  }
  return out;
}
