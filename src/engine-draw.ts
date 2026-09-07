import { EngineInput } from "./engine-input";
import type { CalEvent, PlacedChip } from "./types";
import { C, colorOf, FONT_DISPLAY, FONT_MONO, FONT_UI } from "./theme";
import { clamp, formatHm, formatRange, lerp, smoothstep, DAY } from "./time";
import { coilUnit } from "./ticks";
import { unitApproxMs, floorTo, addUnit } from "./time";
import { seasonSigned, sunTimes, sunEval, moonEval, sunKnots, moonKnots, moonTimes } from "./sun";
import { drawHorizonSun, roundRect } from "./engine-util";
import { lensAmpForSpan } from "./warp";

type SkyKnot = { t: number; x: number; y: number; dx: number; dy: number };
type SkyCubic = { x0: number; y0: number; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number };

export class EngineDraw extends EngineInput {
drawNowWash(nowX: number, ly: number) {
if (this.displayedLensAmp <= .02 || nowX < -40 || nowX > this.width + 40) return;
const target = Math.max(lensAmpForSpan(this.spanMs), .01);
const a = clamp(this.displayedLensAmp / target, 0, 1);
const hw = 90 + Math.min(220, this.width * .08);
const g = this.ctx.createLinearGradient(nowX - hw, 0, nowX + hw, 0);
g.addColorStop(0, "rgba(244,244,246,0)");
g.addColorStop(.5, `rgba(244,244,246,${(.05 * a).toFixed(3)})`);
g.addColorStop(1, "rgba(244,244,246,0)");
this.ctx.fillStyle = g;
this.ctx.fillRect(nowX - hw, 0, hw * 2, this.height);
}
hitSun(x: number, y: number): { rise: number; set: number; px: number; py: number } | null {
if (!this.showSun) return null;
const hovered = this.sunHover || this.sunHoverA > .18;
const k = this.skyK();
return this.hitSky(x, y, (t) => sunEval(t).h * k + (1 - k) * seasonSigned(t), (t) => sunTimes(t), hovered ? 8 : 5);
}
hitMoon(x: number, y: number): { rise: number; set: number; px: number; py: number } | null {
if (!this.showMoon) return null;
const hovered = this.moonHover || this.moonHoverA > .18;
const k = this.skyK();
return this.hitSky(x, y, (t) => moonEval(t).h * k, (t) => moonTimes(t), hovered ? 8 : 5);
}
skyK() {
const pxPerDay = this.width / (this.spanMs / DAY);
return clamp((pxPerDay - 4) / 12, 0, 1);
}
skyAmp(kDaily: number) {
return kDaily * 64 + (1 - kDaily) * 32;
}
skyEnv(x: number) {
const cx = this.width * 0.5;
const sigma = Math.max(90, this.width * 0.32);
const u = (x - cx) / sigma;
return 0.62 + 0.38 * Math.exp(-0.5 * u * u);
}
skyY(ly: number, t: number, x: number, h: number) {
return ly - this.skyAmp(this.skyK()) * this.skyEnv(x) * h;
}
hitSky(
x: number,
y: number,
heightAt: (t: number) => number,
timesAt: (t: number) => { rise: number; set: number },
thresh: number,
): { rise: number; set: number; px: number; py: number } | null {
const t = this.xToTime(x);
const py = this.skyY(this.lineY(), t, x, heightAt(t));
if (Math.abs(y - py) >= thresh) return null;
const times = timesAt(t);
return { rise: times.rise, set: times.set, px: x, py };
}
skyBusy() {
return (
this.mode === "pan" ||
this.mode === "pinch" ||
this.flickT != null ||
Math.abs(this.coastPx) > 12 ||
this.springing
);
}
skyCubics(
ly: number,
evalAt: (t: number) => { h: number; dh: number },
knots: (tL: number, tR: number) => number[],
): SkyCubic[] {
const { width, spanMs } = this;
const kDaily = this.skyK();
const amp = this.skyAmp(kDaily);
const pad = spanMs * 0.15;
const tL = this.tLeft() - pad;
const tR = this.tRight() + pad;
let times: number[];
if (kDaily > 0.2) {
times = knots(tL, tR);
} else {
const n = 8;
times = [];
for (let i = 0; i <= n; i++) times.push(tL + (tR - tL) * (i / n));
}
times.sort((a, b) => a - b);
const uniq: number[] = [];
for (const t of times) {
if (!uniq.length || t - uniq[uniq.length - 1] > 60_000) uniq.push(t);
}
if (this.mapDirty) this.prepareMap();
const den = this.liveDen || 1;
const cx = width * 0.5;
const sigma = Math.max(90, width * 0.32);
const sigma2 = sigma * sigma;
const projected: { t: number; x: number }[] = [];
for (const t of uniq) projected.push({ t, x: this.timeToX(t) });
let lo = 0;
let hi = projected.length - 1;
while (lo < projected.length && projected[lo].x < -80) lo += 1;
while (hi >= 0 && projected[hi].x > width + 80) hi -= 1;
lo = Math.max(0, lo - 1);
hi = Math.min(projected.length - 1, hi + 1);
const knotsOut: SkyKnot[] = [];
for (let i = lo; i <= hi; i++) {
const { t, x } = projected[i];
const { h, dh } = evalAt(t);
const u = x - cx;
const env = 0.62 + 0.38 * Math.exp(-0.5 * (u * u) / sigma2);
const denv = 0.38 * Math.exp(-0.5 * (u * u) / sigma2) * (-u / sigma2);
const dx = (this.dens(t) / den) * width;
const dy = -amp * (denv * dx * h + env * dh);
knotsOut.push({ t, x, y: ly - amp * env * h, dx, dy });
}
const segs: SkyCubic[] = [];
for (let i = 0; i < knotsOut.length - 1; i++) {
const a = knotsOut[i];
const b = knotsOut[i + 1];
if ((a.x < -40 && b.x < -40) || (a.x > width + 40 && b.x > width + 40)) continue;
const dt = b.t - a.t;
if (dt < 1) continue;
segs.push({
x0: a.x,
y0: a.y,
x1: a.x + (a.dx * dt) / 3,
y1: a.y + (a.dy * dt) / 3,
x2: b.x - (b.dx * dt) / 3,
y2: b.y - (b.dy * dt) / 3,
x3: b.x,
y3: b.y,
});
}
return segs;
}
paintSkyCubics(segs: SkyCubic[], ly: number, stroke: string, upFill: string, downFill: string, strokeA: number, fill: boolean) {
const { ctx } = this;
if (!segs.length) return;
ctx.save();
if (fill) {
for (const s of segs) {
const above = (s.y0 + s.y3) * 0.5 < ly;
ctx.beginPath();
ctx.moveTo(s.x0, ly);
ctx.lineTo(s.x0, s.y0);
ctx.bezierCurveTo(s.x1, s.y1, s.x2, s.y2, s.x3, s.y3);
ctx.lineTo(s.x3, ly);
ctx.closePath();
ctx.fillStyle = above ? upFill : downFill;
ctx.globalAlpha = 1;
ctx.fill();
}
}
ctx.lineWidth = 1.3;
ctx.strokeStyle = stroke;
ctx.globalAlpha = strokeA;
ctx.lineJoin = "round";
ctx.lineCap = "round";
ctx.beginPath();
ctx.moveTo(segs[0].x0, segs[0].y0);
for (const s of segs) {
ctx.bezierCurveTo(s.x1, s.y1, s.x2, s.y2, s.x3, s.y3);
}
ctx.stroke();
ctx.restore();
}
drawSun(ly: number) {
const u = smoothstep(this.sunHoverA);
const strokeA = lerp(.24, 1, u);
const dayFillA = lerp(.028, .11, u);
const nightFillA = lerp(.018, .08, u);
const k = this.skyK();
const segs = this.skyCubics(ly, (t) => {
const s = sunEval(t);
return { h: k * s.h + (1 - k) * seasonSigned(t), dh: k * s.dh };
}, sunKnots);
this.paintSkyCubics(
segs,
ly,
C.travel,
`rgba(154,139,124,${dayFillA})`,
`rgba(90,96,110,${nightFillA})`,
strokeA,
!this.skyBusy(),
);
}
drawMoon(ly: number) {
const u = smoothstep(this.moonHoverA);
const strokeA = lerp(.26, 1, u);
const upFillA = lerp(.03, .12, u);
const downFillA = lerp(.018, .07, u);
const k = this.skyK();
const segs = this.skyCubics(ly, (t) => {
const m = moonEval(t);
return { h: k * m.h, dh: k * m.dh };
}, moonKnots);
this.paintSkyCubics(
segs,
ly,
"rgba(140,175,230,1)",
`rgba(110,150,210,${upFillA})`,
`rgba(40,60,110,${downFillA})`,
strokeA,
!this.skyBusy(),
);
}
drawCoil(ly: number) {
const { ctx, width, spanMs } = this;
const { unit, step } = coilUnit(spanMs);
const approx = unitApproxMs(unit, step);
const t0 = this.tLeft() - spanMs * .04;
const t1 = this.tRight() + spanMs * .04;
ctx.lineWidth = 1;
let t = floorTo(t0, unit, step);
let guard = 0;
let prevX = this.timeToX(t);
while (t <= t1 && guard++ < 6e3) {
const next = addUnit(t, unit, step);
const x = this.timeToX(t);
const local = Math.abs(this.timeToX(next) - x);
if (x >= -2 && x <= width + 2 && local >= 2.2) {
const packed = clamp(1 - local / Math.max(8, approx / spanMs * width * 1.6), 0, 1);
const h = 4 + packed * 9;
ctx.globalAlpha = .12 + packed * .5;
ctx.strokeStyle = C.tick;
ctx.beginPath();
ctx.moveTo(x + .5, ly - h);
ctx.lineTo(x + .5, ly + 2);
ctx.stroke();
} else if (x >= -2 && x <= width + 2 && local < 2.2) {
ctx.globalAlpha = .22;
ctx.strokeStyle = C.tick;
ctx.beginPath();
ctx.moveTo(prevX, ly + .5);
ctx.lineTo(x, ly + .5);
ctx.stroke();
}
prevX = x;
t = next;
}
ctx.globalAlpha = 1;
}
drawLine(ly: number) {
const { ctx, width } = this;
ctx.strokeStyle = C.line;
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(0, ly + .5);
ctx.lineTo(width, ly + .5);
ctx.stroke();
}
drawMidnights() {
const { ctx, width, height } = this;
const mids = this.ticks.filter((tk) => tk.boundary && tk.unit === "day");
if (!mids.length) return;
const gap = mids.length > 1 ? Math.abs(mids[1].x - mids[0].x) : width;
const a = clamp(0.11 * (56 / Math.max(28, gap)), 0.045, 0.14);
ctx.save();
ctx.strokeStyle = C.tickMajor;
ctx.lineWidth = 1;
ctx.globalAlpha = a;
for (const tk of mids) {
if (tk.x < -1 || tk.x > width + 1) continue;
ctx.beginPath();
ctx.moveTo(tk.x + .5, 0);
ctx.lineTo(tk.x + .5, height);
ctx.stroke();
}
ctx.restore();
}
drawTicks(ly: number) {
const { ctx } = this;
ctx.textAlign = "center";
ctx.textBaseline = "alphabetic";
ctx.letterSpacing = "0.16em";
for (const tk of this.ticks) {
if (tk.drawTick === false) continue;
const h = tk.boundary ? 16 : tk.major ? 11 : 6;
ctx.strokeStyle = tk.boundary ? C.tickMajor : tk.major ? C.tickMajor : C.tick;
ctx.globalAlpha = tk.boundary ? .95 : tk.major ? .85 : .38;
ctx.lineWidth = tk.boundary ? 1.15 : 1;
ctx.beginPath();
ctx.moveTo(tk.x + .5, ly - h);
ctx.lineTo(tk.x + .5, ly + (tk.boundary ? 7 : tk.major ? 5 : 3));
ctx.stroke();
}
for (const lab of this.labelFade.values()) {
const a = lab.a * this.laneA[lab.lane];
if (a < .04) continue;
ctx.globalAlpha = a;
ctx.fillStyle = lab.lane === "time" ? C.subtle : C.muted;
ctx.font = lab.lane === "time" ? `500 10px ${FONT_DISPLAY}` : `500 11px ${FONT_DISPLAY}`;
ctx.fillText(lab.text, lab.x, this.laneY[lab.lane]);
}
ctx.globalAlpha = 1;
ctx.letterSpacing = "0px";
}
drawBands(_ly: number) {
const { ctx } = this;
for (const p of this.placed) {
if (p.event.kind !== "band") continue;
const x = Math.min(p.x0, p.x1);
const w = Math.abs(p.x1 - p.x0);
if (w < 1 || p.x1 < -20 || p.x0 > this.width + 20) continue;
const col = colorOf(p.event.title, p.event.category);
const long = w > this.width * .85;
ctx.save();
roundRect(ctx, x, p.y, w, p.h, 4);
ctx.fillStyle = col;
ctx.globalAlpha = long ? .07 : p.event.id === this.selectedId ? .38 : .2;
ctx.fill();
if (!long) {
ctx.globalAlpha = p.event.id === this.hoverId ? .7 : .45;
ctx.strokeStyle = col;
ctx.lineWidth = 1;
ctx.stroke();
}
ctx.globalAlpha = 1;
if (w > 64 && !long) {
ctx.font = `500 11px ${FONT_UI}`;
ctx.fillStyle = C.fg;
ctx.textAlign = "left";
ctx.textBaseline = "middle";
ctx.save();
ctx.beginPath();
ctx.rect(x + 4, p.y, w - 8, p.h);
ctx.clip();
ctx.globalAlpha = .85;
ctx.fillText(p.event.title, x + 8, p.y + p.h / 2);
ctx.restore();
}
ctx.restore();
}
}
}
