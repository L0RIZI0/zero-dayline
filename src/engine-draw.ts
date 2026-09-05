import { EngineInput } from "./engine-input";
import type { CalEvent, PlacedChip } from "./types";
import { C, colorOf, FONT_DISPLAY, FONT_MONO, FONT_UI } from "./theme";
import { clamp, formatHm, formatRange, lerp, smoothstep, startOfDay, DAY } from "./time";
import { coilUnit } from "./ticks";
import { unitApproxMs, floorTo, addUnit } from "./time";
import { seasonSigned, sunTimes, sunUnit } from "./sun";
import { drawHorizonSun, roundRect } from "./engine-util";
import { lensAmpForSpan } from "./warp";

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
this.ctx.fillRect(nowX - hw, 0, hw * 2, ly + 40);
}
hitSun(x: number, y: number): { rise: number; set: number; px: number; py: number } | null {
const pts = this.sunPts;
if (pts.length < 2) return null;
const hovered = this.sunHover || this.sunHoverA > .18;
const thresh = hovered ? 7 : 4.2;
let best = thresh;
let bx = x;
let by = y;
for (let i = 1; i < pts.length; i++) {
const ax = pts[i - 1].x;
const ay = pts[i - 1].y;
const cx = pts[i].x;
const cy = pts[i].y;
const dx = cx - ax;
const dy = cy - ay;
const l2 = dx * dx + dy * dy || 1;
const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
const px = ax + t * dx;
const py = ay + t * dy;
const d = Math.hypot(x - px, y - py);
if (d < best) {
best = d;
bx = px;
by = py;
}
}
if (best >= thresh) return null;
const times = sunTimes(this.xToTime(bx));
return { rise: times.rise, set: times.set, px: bx, py: by };
}
drawSun(ly: number) {
const { ctx, width, spanMs } = this;
const ampDay = 78;
const ampSeason = 40;
const pxPerDay = width / (spanMs / DAY);
const kDaily = clamp((pxPerDay - 4) / 12, 0, 1);
const u = smoothstep(this.sunHoverA);
const strokeA = lerp(.38, 1, u);
const dayFillA = lerp(.045, .11, u);
const nightFillA = lerp(.03, .08, u);
const cx = width * 0.5;
const sigma = Math.max(90, width * 0.32);
const envAt = (x: number) => 0.62 + 0.38 * Math.exp(-0.5 * ((x - cx) / sigma) * ((x - cx) / sigma));
ctx.save();
ctx.lineWidth = lerp(1.3, 1.75, u);
ctx.strokeStyle = C.travel;
ctx.globalAlpha = strokeA;
ctx.lineJoin = "round";
ctx.lineCap = "round";
const extra =
Math.abs(this.centerT - this.lagCenter) +
0.55 * Math.abs(this.spanMs - this.lagSpan) +
spanMs * 0.08;
const half = Math.max(spanMs, this.lagSpan) * 0.5;
const tL = Math.min(this.centerT, this.lagCenter) - half - extra;
const tR = Math.max(this.centerT, this.lagCenter) + half + extra;
type P = { t: number; x: number };
let raw: P[] = [];
const n0 = Math.min(160, Math.max(48, Math.floor(width / 8)));
for (let i = 0; i <= n0; i++) {
const t = tL + (tR - tL) * (i / n0);
raw.push({ t, x: this.timeToX(t) });
}
if (kDaily > 0.2) {
const d0 = startOfDay(tL - DAY);
const d1 = startOfDay(tR) + DAY;
const dMax = d0 + 60 * DAY;
for (let d = d0; d <= d1 && d <= dMax; d += DAY) {
const { rise, set } = sunTimes(d);
raw.push({ t: rise, x: this.timeToX(rise) });
raw.push({ t: (rise + set) / 2, x: this.timeToX((rise + set) / 2) });
raw.push({ t: set, x: this.timeToX(set) });
}
raw.sort((a, b) => a.t - b.t);
}
const MAX_DX = 3;
const MAX_N = 420;
for (let pass = 0; pass < 7; pass++) {
if (raw.length >= MAX_N) break;
let grew = false;
const next: P[] = [raw[0]];
for (let i = 0; i < raw.length - 1; i++) {
const a = raw[i];
const b = raw[i + 1];
if (
next.length < MAX_N &&
Math.abs(b.x - a.x) > MAX_DX &&
Math.abs(b.t - a.t) > 45_000
) {
const t = (a.t + b.t) * 0.5;
next.push({ t, x: this.timeToX(t) });
grew = true;
}
next.push(b);
}
raw = next;
if (!grew) break;
}
const ys: { x: number; y: number }[] = [];
let lastX = -1e9;
for (const p of raw) {
if (Math.abs(p.x - lastX) < 0.35) continue;
lastX = p.x;
const h = kDaily * sunUnit(p.t) + (1 - kDaily) * seasonSigned(p.t);
const amp = kDaily * ampDay + (1 - kDaily) * ampSeason;
ys.push({ x: p.x, y: ly - amp * envAt(p.x) * h });
}
this.sunPts = ys;
ctx.beginPath();
if (ys.length) {
ctx.moveTo(ys[0].x, ys[0].y);
for (let i = 1; i < ys.length; i++) ctx.lineTo(ys[i].x, ys[i].y);
}
ctx.stroke();
if (ys.length > 1) {
ctx.beginPath();
ctx.moveTo(ys[0].x, ly);
for (const p of ys) ctx.lineTo(p.x, Math.min(p.y, ly));
ctx.lineTo(ys[ys.length - 1].x, ly);
ctx.closePath();
ctx.fillStyle = `rgba(154,139,124,${dayFillA})`;
ctx.globalAlpha = 1;
ctx.fill();
ctx.beginPath();
ctx.moveTo(ys[0].x, ly);
for (const p of ys) ctx.lineTo(p.x, Math.max(p.y, ly));
ctx.lineTo(ys[ys.length - 1].x, ly);
ctx.closePath();
ctx.fillStyle = `rgba(90,96,110,${nightFillA})`;
ctx.fill();
}
ctx.restore();
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
