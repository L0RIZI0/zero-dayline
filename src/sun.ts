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

function moonK(t: number): number {
  return Math.floor((t - NEW_MOON) / LUNAR_DAY + 0.5);
}

/** One lunar passage (nearest transit). Rise/set are the axis knots. */
export function moonPassage(t: number): { rise: number; set: number; transit: number } {
  const k = moonK(t);
  for (let i = 0; i < _moon.length; i++) if (_moon[i].k === k) return _moon[i].v;
  const transit = NEW_MOON + k * LUNAR_DAY;
  const dec = Math.sin((2 * Math.PI * (transit - NEW_MOON)) / TROPICAL_MONTH);
  const up = (12.15 + dec * 1.35) * HOUR;
  const v = { transit, rise: transit - up / 2, set: transit + up / 2 };
  if (_moon.length >= 8) _moon.shift();
  _moon.push({ k, v });
  return v;
}

export function moonTimes(ms: number): { rise: number; set: number } {
  const p = moonPassage(ms);
  return { rise: p.rise, set: p.set };
}

/**
 * Same knot rule as the sun: 0 at moonrise / moonset, + when the moon is up,
 * − when it's down. ~50 min later each day (mean lunar day).
 */
export function moonUnit(t: number): number {
  const cur = moonPassage(t);
  if (t < cur.rise) {
    const prev = moonPassage(cur.transit - LUNAR_DAY / 2);
    const upW = Math.max(1, prev.set - prev.rise);
    const downW = Math.max(1, cur.rise - prev.set);
    return -(downW / upW) * sunHeight((t - prev.set) / downW);
  }
  const upW = Math.max(1, cur.set - cur.rise);
  if (t <= cur.set) return sunHeight((t - cur.rise) / upW);
  const next = moonPassage(cur.transit + LUNAR_DAY / 2);
  const downW = Math.max(1, next.rise - cur.set);
  return -(downW / upW) * sunHeight((t - cur.set) / downW);
}

/** Extra sample times so the polyline hits the axis at rise/set. */
export function sunKnots(tL: number, tR: number): number[] {
  const out: number[] = [];
  const d0 = startOfDay(tL - DAY);
  const d1 = startOfDay(tR) + DAY;
  const dMax = d0 + 60 * DAY;
  for (let d = d0; d <= d1 && d <= dMax; d += DAY) {
    const { rise, set } = sunTimes(d);
    out.push(rise, (rise + set) / 2, set);
  }
  return out;
}

export function moonKnots(tL: number, tR: number): number[] {
  const out: number[] = [];
  const k0 = moonK(tL) - 1;
  const k1 = moonK(tR) + 1;
  const kMax = k0 + 80;
  for (let k = k0; k <= k1 && k <= kMax; k++) {
    const p = moonPassage(NEW_MOON + k * LUNAR_DAY);
    out.push(p.rise, p.transit, p.set);
  }
  return out;
}
