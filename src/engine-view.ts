import { EngineCore, LANE_ORDER, LANE_ROW, type Hit } from "./engine-core";
import {
  MAX_SPAN_MS,
  MIN_SPAN_MS,
} from "./types";
import { FONT_DISPLAY, LABEL_TRACK } from "./theme";
import {
  clamp,
  DAY,
  expDamp,
  floorTo,
  HOUR,
  addUnit,
  unitApproxMs,
} from "./time";
import {
  BUSY_WEIGHT,
  emptyWeightForSpan,
  hannCum,
  lensAmpForSpan,
  lensDensity,
  nowLensHalfWidth,
} from "./warp";
import { buildTicks, coilUnit, labelLane } from "./ticks";
import type { CalEvent, PlacedChip } from "./types";

export class EngineView extends EngineCore {
frame = (ts: number) => {
if (!this.running) return;
this.raf = requestAnimationFrame(this.frame);
const dt = clamp((ts - this.lastTs) / 1e3, .001, .05);
this.lastTs = ts;
if (this.clockMode !== "data") this.now = Date.now();
if (this.clockMode !== "data") {
for (const e of this.events) if (e.openEnded) e.end = this.now;
}
try {
if (this.needsResize) this.resize();
this.step(dt);
if (this.width >= 16 && this.height >= 16) this.draw();
this.emit();
} catch (err) {
console.error(err);
}
};
step(dt: number) {
const targetEmpty = emptyWeightForSpan(this.spanMs, this.warpStrength);
const kEmpty = this.reducedMotion ? 40 : 3.4;
this.displayedEmpty += (targetEmpty - this.displayedEmpty) * expDamp(kEmpty, dt);
if (Math.abs(targetEmpty - this.displayedEmpty) > .002) this.dirtyWarp = true;
const lensTarget = this.nowLensOn ? lensAmpForSpan(this.spanMs) : 0;
const kLens = this.reducedMotion ? 28 : 4.4;
this.displayedLensAmp += (lensTarget - this.displayedLensAmp) * expDamp(kLens, dt);
const sunTarget = this.sunHover ? 1 : 0;
const kSun = this.reducedMotion ? 36 : 3.15;
this.sunHoverA += (sunTarget - this.sunHoverA) * expDamp(kSun, dt);
if (!this.sunHover && this.sunHoverA < .012) {
this.sunHoverA = 0;
this.hoverSun = null;
}
const moonTarget = this.moonHover ? 1 : 0;
this.moonHoverA += (moonTarget - this.moonHoverA) * expDamp(kSun, dt);
if (!this.moonHover && this.moonHoverA < .012) {
this.moonHoverA = 0;
this.hoverMoon = null;
}
if (this.springing) {
const k = this.reducedMotion ? 240 : 78;
const d = this.reducedMotion ? 32 : 15.5;
const accC = -k * (this.centerT - this.targetCenter) - d * this.centerVel;
this.centerVel += accC * dt;
this.centerT += this.centerVel * dt;
const log = Math.log(this.spanMs);
const logT = Math.log(this.targetSpan);
const accS = -k * (log - logT) - d * this.logSpanVel;
this.logSpanVel += accS * dt;
this.spanMs = clamp(Math.exp(log + this.logSpanVel * dt), MIN_SPAN_MS, MAX_SPAN_MS);
if (Math.abs(this.centerT - this.targetCenter) < 8 && Math.abs(this.spanMs - this.targetSpan) / this.targetSpan < .002 && Math.abs(this.centerVel) < 20 && Math.abs(this.logSpanVel) < .01) {
this.centerVel = 0;
this.logSpanVel = 0;
this.springing = false;
}
this.dirtyWarp = true;
} else if (this.mode === "none") {
if (Math.abs(this.slidePx) > 0.08) {
const a = 1 - Math.exp(-(this.reducedMotion ? 28 : 8.4) * dt);
const take = this.slidePx * a;
this.panBy(take);
this.slidePx -= take;
if (Math.abs(this.slidePx) < 0.08) this.slidePx = 0;
}
if (Math.abs(this.slideZoomLog) > 1e-5) {
const a = 1 - Math.exp(-(this.reducedMotion ? 28 : 8.4) * dt);
const take = this.slideZoomLog * a;
this.zoomAt(this.wheelX, Math.exp(take), false);
this.slideZoomLog -= take;
if (Math.abs(this.slideZoomLog) < 1e-5) this.slideZoomLog = 0;
}
if (this.flickT != null && Math.abs(this.flickV) > 14) {
this.flickX += this.flickV * dt;
this.setAnchor(this.flickT, this.flickX);
this.flickV *= Math.exp(-2.55 * dt);
if (Math.abs(this.flickV) <= 14) {
this.flickT = null;
this.flickV = 0;
}
} else if (Math.abs(this.coastPx) > 12) {
this.panBy(this.coastPx * dt);
this.coastPx *= Math.exp(-2.55 * dt);
if (Math.abs(this.coastPx) <= 12) this.coastPx = 0;
}
if (Math.abs(this.zoomCoast) > .0012) {
const factor = Math.exp(this.zoomCoast * (1 - Math.exp(-4.6 * dt)));
this.zoomAt(this.focusX, factor, false);
this.zoomCoast *= Math.exp(-4.6 * dt);
if (Math.abs(this.zoomCoast) <= .0012) this.zoomCoast = 0;
}
}
const sliding = Math.abs(this.slidePx) > 0.08 || Math.abs(this.slideZoomLog) > 1e-5;
const active = this.mode === "pan" || this.mode === "pinch" || this.springing || this.flickT != null || Math.abs(this.coastPx) > 12 || Math.abs(this.zoomCoast) > .0012 || sliding;
const kLag = this.reducedMotion ? 40 : active ? 4.4 : 9.2;
this.lagCenter += (this.centerT - this.lagCenter) * expDamp(kLag, dt);
const logLag = Math.log(Math.max(this.lagSpan, MIN_SPAN_MS));
const logNow = Math.log(this.spanMs);
this.lagSpan = Math.exp(logLag + (logNow - logLag) * expDamp(kLag, dt));
this.clampView();
this.rebuildWarp();
this.mapDirty = true;
this.placed = this.layout();
this.stepChipPose(dt);
this.stepHandleA(dt);
this.collectTicks();
this.stepLabelLanes(dt);
this.stepLabelFade(dt);
}
afterResize() {
if (!this.running || this.width < 16 || this.height < 16) return;
this.dirtyWarp = true;
this.rebuildWarp();
this.mapDirty = true;
this.placed = this.layout();
this.collectTicks();
this.draw();
}
panBy(dx: number) {
if (this.width < 8) return;
const mid = this.xToTime(this.width / 2);
this.setAnchor(mid, this.width / 2 - dx);
}
collectTicks() {
if (this.width < 16) {
this.ticks = [];
return;
}
this.ctx.font = `500 11px ${FONT_DISPLAY}`;
this.ctx.letterSpacing = LABEL_TRACK;
const measure = (s: string) => {
let w = this.textW.get(s);
if (w == null) {
w = this.ctx.measureText(s).width;
this.textW.set(s, w);
}
return w;
};
this.ticks = buildTicks(this.tLeft(), this.tRight(), this.spanMs, (t) => this.timeToX(t), this.width, measure);
this.ctx.letterSpacing = "0px";
}
stepLabelLanes(dt: number) {
const ly = this.lineY();
let chipTop = Infinity;
for (const p of this.placed) {
if (p.clustered || p.event.kind !== "event") continue;
if (p.x1 < -20 || p.x0 > this.width + 20) continue;
if (p.y >= ly) continue;
chipTop = Math.min(chipTop, p.y);
}
const targetAnchor = chipTop === Infinity ? ly - 16 : Math.max(28, chipTop - 8);
const kA = this.reducedMotion ? 48 : 9.5;
this.labelAnchor += (targetAnchor - this.labelAnchor) * expDamp(kA, dt);
const present = {
time: false,
day: false,
month: false,
year: false
};
for (const tk of this.ticks) if (tk.label) present[labelLane(tk.unit)] = true;
let row = 0;
const kY = this.reducedMotion ? 48 : 11;
const kO = this.reducedMotion ? 48 : 10;
for (const lane of LANE_ORDER) {
const on = present[lane];
const targetA = on ? 1 : 0;
const targetY = this.labelAnchor - 4 - row * LANE_ROW;
if (!this.lanesInited || this.reducedMotion) {
this.laneA[lane] = targetA;
this.laneY[lane] = targetY;
} else {
this.laneA[lane] += (targetA - this.laneA[lane]) * expDamp(kO, dt);
this.laneY[lane] += (targetY - this.laneY[lane]) * expDamp(kY, dt);
}
if (on || this.laneA[lane] > .12) row += 1;
}
this.lanesInited = true;
}
stepChipPose(dt: number) {
const k = this.reducedMotion ? 48 : 10.5;
const kA = this.reducedMotion ? 48 : 9.2;
const seen = new Set<string>();
const ly = this.lineY();
const snap = !this.chipsInited || this.reducedMotion;
for (const p of this.placed) {
if (p.clustered) continue;
seen.add(p.event.id);
const prev = this.chipPose.get(p.event.id);
if (!prev || snap) {
this.chipPose.set(p.event.id, {
y: snap ? p.y : ly,
h: p.h,
a: snap ? 1 : 0,
ghost: p,
});
if (snap) continue;
}
const cur = this.chipPose.get(p.event.id)!;
const y = cur.y + (p.y - cur.y) * expDamp(k, dt);
const h = cur.h + (p.h - cur.h) * expDamp(k, dt);
const a = cur.a + (1 - cur.a) * expDamp(kA, dt);
this.chipPose.set(p.event.id, { y, h, a, ghost: p });
p.y = y;
p.h = h;
}
for (const [id, pose] of [...this.chipPose.entries()]) {
if (seen.has(id)) continue;
const a = pose.a + (0 - pose.a) * expDamp(kA, dt);
if (a < 0.03) {
this.chipPose.delete(id);
continue;
}
const g = pose.ghost;
g.x0 = this.timeToX(g.event.start);
g.x1 = this.timeToX(g.event.end);
this.chipPose.set(id, { ...pose, a, ghost: g });
}
this.chipsInited = true;
}
stepHandleA(dt: number) {
const k = this.reducedMotion ? 40 : 13;
const live = new Set<string>();
for (const p of this.placed) {
if (p.clustered || p.event.point || p.x1 - p.x0 <= 28) continue;
const on = p.event.id === this.selectedId || p.event.id === this.hoverId;
if (!on && !this.handleA.has(p.event.id)) continue;
live.add(p.event.id);
const cur = this.handleA.get(p.event.id) ?? 0;
const next = cur + ((on ? 1 : 0) - cur) * expDamp(k, dt);
if (next < 0.02 && !on) this.handleA.delete(p.event.id);
else this.handleA.set(p.event.id, next);
}
for (const [id, cur] of [...this.handleA]) {
if (live.has(id)) continue;
const next = cur + (0 - cur) * expDamp(k, dt);
if (next < 0.02) this.handleA.delete(id);
else this.handleA.set(id, next);
}
}
stepLabelFade(dt: number) {
const k = this.reducedMotion ? 48 : 12;
const seen = new Set();
for (const tk of this.ticks) {
if (!tk.label) continue;
const id = `${tk.unit}:${tk.t}`;
seen.add(id);
const a0 = this.labelFade.get(id)?.a ?? 0;
const a = this.reducedMotion ? 1 : a0 + (1 - a0) * expDamp(k, dt);
this.labelFade.set(id, {
id,
x: tk.x,
text: tk.label,
lane: labelLane(tk.unit),
unit: tk.unit,
a
});
}
for (const [id, lab] of this.labelFade) {
if (seen.has(id)) continue;
const a = this.reducedMotion ? 0 : lab.a * Math.exp(-k * dt);
if (a < .03) this.labelFade.delete(id);
else this.labelFade.set(id, {
...lab,
a
});
}
}
springTo(center: number, span: number) {
this.targetCenter = center;
this.targetSpan = clamp(span, MIN_SPAN_MS, MAX_SPAN_MS);
this.springing = true;
this.coastPx = 0;
this.slidePx = 0;
this.slideZoomLog = 0;
this.flickT = null;
this.flickV = 0;
if (this.reducedMotion) {
this.centerT = this.targetCenter;
this.spanMs = this.targetSpan;
this.springing = false;
this.dirtyWarp = true;
}
}
bounds() {
let min = this.now - 730 * DAY;
let max = this.now + 730 * DAY;
for (const e of this.events) {
if (e.start < min) min = e.start;
if (e.end > max) max = e.end;
}
return {
min: min - 120 * DAY,
max: max + 180 * DAY
};
}
clampView() {
const { min, max } = this.bounds();
const pad = this.spanMs * .45;
this.centerT = clamp(this.centerT, min - pad, max + pad);
this.spanMs = clamp(this.spanMs, MIN_SPAN_MS, MAX_SPAN_MS);
}
tLeft() {
return this.centerT - this.spanMs / 2;
}
tRight() {
return this.centerT + this.spanMs / 2;
}
lens() {
return {
now: this.lensNow,
halfWidth: this.lensHalf,
amp: this.lensAmp,
};
}
prepareMap() {
this.lensNow = this.now;
this.lensHalf = nowLensHalfWidth(this.spanMs);
this.lensAmp = this.displayedLensAmp;
const tL = this.centerT - this.spanMs / 2;
const tR = this.centerT + this.spanMs / 2;
this.liveA = this.W(tL);
this.liveDen = this.W(tR) - this.liveA;
if (Math.abs(this.liveDen) < 1e-9) this.liveDen = 1;
this.lagClose =
this.reducedMotion ||
this.width < 8 ||
(Math.abs(this.centerT - this.lagCenter) < this.spanMs * 1e-5 &&
Math.abs(this.spanMs - this.lagSpan) < this.spanMs * 1e-5);
if (!this.lagClose) {
const lL = this.lagCenter - this.lagSpan / 2;
const lR = this.lagCenter + this.lagSpan / 2;
this.lagA = this.W(lL);
this.lagDen = this.W(lR) - this.lagA;
if (Math.abs(this.lagDen) < 1e-9) this.lagDen = 1;
}
this.mapFocusX = this.focusX;
const sigma = Math.max(72, this.width * 0.18);
this.mapSigma2 = 2 * sigma * sigma;
this.mapDirty = false;
}
W(t: number) {
const w = this.warp.at(t);
if (this.lensAmp <= 0) return w;
return w + this.lensAmp * this.lensHalf * hannCum((t - this.lensNow) / this.lensHalf);
}
dens(t: number) {
return this.warp.densityAt(t) + lensDensity(t, this.lens());
}
mapX(t: number, center: number, span: number) {
const tL = center - span / 2;
const tR = center + span / 2;
const a = this.W(tL);
const den = this.W(tR) - a;
if (Math.abs(den) < 1e-9) return this.width / 2;
return ((this.W(t) - a) / den) * this.width;
}
timeToX(t: number) {
if (this.mapDirty) this.prepareMap();
const live = ((this.W(t) - this.liveA) / this.liveDen) * this.width;
if (this.lagClose) return live;
const lag = ((this.W(t) - this.lagA) / this.lagDen) * this.width;
const d = live - this.mapFocusX;
const mix = Math.exp(-(d * d) / this.mapSigma2);
return lag + (live - lag) * mix;
}
xToTime(x: number) {
if (this.mapDirty) this.prepareMap();
const target = this.liveA + (x / Math.max(this.width, 1)) * this.liveDen;
let lo = this.centerT - this.spanMs;
let hi = this.centerT + this.spanMs;
for (let i = 0; i < 18; i++) {
const mid = (lo + hi) / 2;
if (this.W(mid) < target) lo = mid;
else hi = mid;
}
return (lo + hi) / 2;
}
setAnchor(t: number, x: number) {
if (this.mapDirty) this.prepareMap();
const span = this.spanMs;
const wt = this.W(t);
const width = this.width;
let lo = t - span * 4;
let hi = t + span * 4;
for (let i = 0; i < 18; i++) {
const mid = (lo + hi) / 2;
const a = this.W(mid - span / 2);
const den = this.W(mid + span / 2) - a;
const mx = Math.abs(den) < 1e-9 ? width / 2 : ((wt - a) / den) * width;
if (mx > x) lo = mid;
else hi = mid;
}
const c = (lo + hi) / 2;
this.centerT = Number.isFinite(c) ? c : this.centerT;
this.mapDirty = true;
}
zoomAt(x: number, factor: number, coast = true) {
const t = this.xToTime(x);
this.spanMs = clamp(this.spanMs * factor, MIN_SPAN_MS, MAX_SPAN_MS);
this.targetSpan = this.spanMs;
this.springing = false;
this.dirtyWarp = true;
this.rebuildWarp();
this.setAnchor(t, x);
if (coast) {
this.noteGesture(x);
this.zoomCoast += Math.log(factor) * .78;
}
}
noteGesture(x: number) {
this.focusX = x;
this.gestureAt = performance.now();
}
rebuildWarp() {
const span = Math.max(this.spanMs, 1);
const viewL = this.centerT - span * .5;
const viewR = this.centerT + span * .5;
const margin = span * .55;
const spanRatio = (this.warp.t1 - this.warp.t0) / span;
const emptyOk = Math.abs(this.warp.emptyWeight - this.displayedEmpty) < .003;
const covered = this.warp.n > 8 && viewL - margin >= this.warp.t0 && viewR + margin <= this.warp.t1 && spanRatio >= 2.4 && spanRatio <= 10 && emptyOk;
if (!this.dirtyWarp && covered) return;
const pad = span * 3.4;
const quant = Math.max(span / 3, HOUR);
const a = Math.floor((this.centerT - pad) / quant) * quant;
const b = a + Math.max(pad * 2, span * 6);
if (!this.dirtyWarp && this.warp.n > 8 && Math.abs(this.warp.t0 - a) < quant * .02 && Math.abs(this.warp.t1 - b) < quant * .02 && emptyOk) return;
this.warp.emptyWeight = this.displayedEmpty;
this.warp.busyWeight = BUSY_WEIGHT;
this.warp.configure(a, b, 2304);
this.warp.rebuild(this.events.filter((e: CalEvent) => {
if (e.kind === "event" || e.kind === "milestone") return true;
if (e.kind !== "band") return false;
const d = e.end - e.start;
return d >= 72e6 && d < 13824e5;
}));
this.dirtyWarp = false;
if (this.mode === "pan") this.setAnchor(this.grabT, this.cursorX);
else if (this.mode === "pinch") this.setAnchor(this.pinchT, this.pinchX);
else if (this.flickT != null) this.setAnchor(this.flickT, this.flickX);
}
lineY() {
return Math.round(this.bandHeight() * .62);
}
}
