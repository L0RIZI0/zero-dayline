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

function sineEval(u: number, amp: number, dur: number): { h: number; dh: number } {
  const uu = clamp(u, 0, 1);
  const s = Math.sin(Math.PI * uu);
  const c = u <= 0 || u >= 1 ? (u <= 0 ? 1 : -1) : Math.cos(Math.PI * uu);
  return { h: amp * s, dh: (amp * Math.PI * c) / Math.max(1, dur) };
}

/** Height and d/dt of the sun wave. 0 at rise/set. */
export function sunEval(t: number): { h: number; dh: number } {
  const { rise, set } = sunTimes(t);
  if (t < rise) {
    const prev = sunTimes(t - DAY);
    const dayW = Math.max(1, prev.set - prev.rise);
    const nightW = Math.max(1, rise - prev.set);
    return sineEval((t - prev.set) / nightW, -(nightW / dayW), nightW);
  }
  const dayW = Math.max(1, set - rise);
  if (t <= set) return sineEval((t - rise) / dayW, 1, dayW);
  const next = sunTimes(t + DAY);
  const nightW = Math.max(1, next.rise - set);
  return sineEval((t - set) / nightW, -(nightW / dayW), nightW);
}

export function sunUnit(t: number): number {
  return sunEval(t).h;
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

function moonPair(t: number) {
  let k = moonKFloor(t);
  let p = passageK(k);
  if (t < p.rise) p = passageK(k - 1);
  let next = passageK(p.k + 1);
  if (t >= next.rise) {
    p = next;
    next = passageK(p.k + 1);
  }
  return { p, next };
}

export function moonEval(t: number): { h: number; dh: number } {
  const { p, next } = moonPair(t);
  const upW = Math.max(1, p.set - p.rise);
  if (t <= p.set) return sineEval((t - p.rise) / upW, 1, upW);
  const downW = Math.max(1, next.rise - p.set);
  return sineEval((t - p.set) / downW, -(downW / upW), downW);
}

export function moonUnit(t: number): number {
  return moonEval(t).h;
}

/** Extra sample times so the polyline hits the axis at rise/set. */
export function sunKnots(tL: number, tR: number): number[] {
  const out: number[] = [];
  const d0 = startOfDay(tL - DAY);
  const d1 = startOfDay(tR) + 2 * DAY;
  const nMax = Math.min(90, Math.max(4, Math.ceil((tR - tL) / DAY) + 4));
  let n = 0;
  for (let d = d0; d <= d1 && n < nMax; d += DAY, n++) {
    const { rise, set } = sunTimes(d);
    const next = sunTimes(d + DAY);
    out.push(rise, (rise + set) / 2, set, (set + next.rise) / 2);
  }
  return out;
}

export function moonKnots(tL: number, tR: number): number[] {
  const out: number[] = [];
  const k0 = moonKFloor(tL) - 1;
  const nMax = Math.min(90, Math.max(4, Math.ceil((tR - tL) / DAY) + 4));
  const k1 = k0 + nMax;
  for (let k = k0; k <= k1; k++) {
    const p = passageK(k);
    const next = passageK(k + 1);
    out.push(p.rise, p.transit, p.set, (p.set + next.rise) / 2);
  }
  return out;
}
