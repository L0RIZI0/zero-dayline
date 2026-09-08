export type { EngineHost, EngineOptions } from "./engine-core";
import { EngineDraw } from "./engine-draw";
import type { CalEvent, PlacedChip } from "./types";
import { C, colorOf, FONT_DISPLAY, FONT_MONO, FONT_UI, inkOn } from "./theme";
import { clamp, formatHm, formatRange, lerp, smoothstep, DAY } from "./time";
import { drawGlyph, type GlyphDrawFlags } from "./glyphDraw";
import { drawHorizonSun, drawHorizonMoon, roundRect } from "./engine-util";
import { sunRgb, rgbCss, moonPassage, moonPhaseName } from "./sun";

export class DaylineEngine extends EngineDraw {
constructor(canvas: HTMLCanvasElement, host: import("./engine-core").EngineHost, opts: import("./engine-core").EngineOptions = {}) {
super(canvas, host, opts);
this.startLoop();
}
glyphFlags(e: CalEvent, size: number, cx: number, cy: number, bg: string): GlyphDrawFlags {
const mark = e.mark!;
const g = mark.glyph;
const fx = this.glyphFx.get(e.id);
const filled = !!g.filled;
const scheduled =
g.scheduled ?? (mark.track === "planned" && !e.ongoing && e.start > this.now && !filled && !g.done);
return {
kind: g.kind,
accent: this.accentOf(e),
bg,
size,
cx,
cy,
ongoing: !!(e.ongoing || g.ongoing),
flip180: !!g.flip180,
done: !!g.done,
cancelled: !!(e.cancelled || g.cancelled),
filled,
scheduled,
requested: !!g.requested,
timeMs: this.lastTs || performance.now(),
reducedMotion: this.reducedMotion,
spinOnceAt: fx?.spinOnceAt,
flashAt: fx?.flashAt,
flashDur: fx?.flashDur,
ongoingSince: fx?.ongoingSince,
landingFrom: fx?.landingFrom,
landingAt: fx?.landingAt,
};
}
draw() {
const { ctx, width } = this;
const band = this.bandHeight();
if (this.skyBleedPx > 0) {
ctx.clearRect(0, 0, width, this.height);
ctx.fillStyle = C.bg;
ctx.fillRect(0, 0, width, band);
} else {
ctx.fillStyle = C.bg;
ctx.fillRect(0, 0, width, this.height);
}
const ly = this.lineY();
const nowX = this.timeToX(this.now);
this.drawNowWash(nowX, ly);
if (this.sunVisA > .01) this.drawSun(ly);
if (this.moonVisA > .01) this.drawMoon(ly);
ctx.save();
if (this.skyBleedPx > 0) {
ctx.beginPath();
ctx.rect(0, 0, width, band);
ctx.clip();
}
this.drawMidnights();
this.drawCoil(ly);
this.drawLine(ly);
this.drawTicks(ly);
this.drawBands(ly);
this.drawChips();
this.drawMilestones(ly);
this.drawNowHead(nowX, ly);
if (this.snapGuide != null) this.drawSnap(this.snapGuide, ly);
ctx.restore();
this.drawHoverTip();
}
drawMarkChip(p: PlacedChip) {
const { ctx } = this;
const e = p.event;
const mark = e.mark;
if (!mark) return;
const x = Math.min(p.x0, p.x1);
const w = Math.max(2, Math.abs(p.x1 - p.x0));
if (p.x1 < -40 || p.x0 > this.width + 40) return;
const col = this.accentOf(e);
const sel = e.id === this.selectedId;
const hov = e.id === this.hoverId;
const ghost = (e.cancelled ? 0.38 : e.auto ? 0.55 : 1) * this.chipAlpha(e.id);
ctx.save();
ctx.globalAlpha = ghost * (sel ? 1 : hov ? 0.92 : 0.88);
const fadeL = e.unknownStart ? Math.min(28, w * 0.35) : 0;
const fadeR = e.openEnded || e.unknownEnd ? Math.min(36, w * 0.45) : 0;
roundRect(ctx, x, p.y, w, p.h, 6);
if (fadeL || fadeR) {
const g = ctx.createLinearGradient(x, 0, x + w, 0);
g.addColorStop(0, fadeL ? "rgba(0,0,0,0)" : col);
if (fadeL) g.addColorStop(Math.min(0.45, fadeL / Math.max(w, 1)), col);
if (fadeR) g.addColorStop(Math.max(0.55, 1 - fadeR / Math.max(w, 1)), col);
g.addColorStop(1, fadeR ? "rgba(0,0,0,0)" : col);
ctx.fillStyle = g;
ctx.globalAlpha = ghost * (sel ? 0.32 : 0.22);
ctx.fill();
} else {
ctx.fillStyle = col;
ctx.globalAlpha = ghost * (sel ? 0.32 : hov ? 0.26 : 0.2);
ctx.fill();
}
ctx.globalAlpha = ghost * (sel ? 0.95 : 0.7);
ctx.strokeStyle = col;
ctx.lineWidth = sel ? 1.6 : 1;
roundRect(ctx, x, p.y, w, p.h, 6);
ctx.stroke();
const gSize = Math.min(16, p.h - 4);
const gx = x + 4 + gSize / 2;
const gy = p.y + p.h / 2;
ctx.globalAlpha = ghost;
drawGlyph(ctx, this.glyphFlags(e, gSize, gx, gy, C.bg));
if (w > 40) {
ctx.font = `500 12px ${FONT_UI}`;
ctx.fillStyle = C.fg;
ctx.textAlign = "left";
ctx.textBaseline = "middle";
ctx.globalAlpha = ghost * 0.92;
ctx.save();
ctx.beginPath();
ctx.rect(x + gSize + 8, p.y, Math.max(0, w - gSize - 14), p.h);
ctx.clip();
ctx.fillText(e.title, x + gSize + 10, p.y + p.h / 2 + 0.5);
ctx.restore();
}
if (w > 28 && !e.point) this.drawChipHandles(x, p.y, w, p.h, e.id, ghost, sel);
ctx.restore();
}
chipAlpha(id: string): number {
return this.chipPose.get(id)?.a ?? 1;
}
drawChipHandles(x: number, y: number, w: number, h: number, id: string, ghost: number, sel: boolean, color = C.handle) {
const a = this.handleA.get(id) ?? 0;
const u = smoothstep(a);
if (u < 0.02) return;
const { ctx } = this;
const slide = (1 - u) * 6;
const peak = sel ? 0.4 : 0.28;
ctx.save();
ctx.beginPath();
ctx.rect(x, y, w, h);
ctx.clip();
ctx.globalAlpha = ghost * peak * u;
ctx.fillStyle = color;
roundRect(ctx, x + 1 - slide, y + 5, 4, h - 10, 1);
ctx.fill();
roundRect(ctx, x + w - 5 + slide, y + 5, 4, h - 10, 1);
ctx.fill();
ctx.restore();
}
drawChips() {
const { ctx } = this;
const live = new Set<string>();
for (const p of this.placed) {
if (p.event.kind !== "event" && !p.clustered) continue;
live.add(p.event.id);
if (p.clustered) {
this.drawCluster(p);
continue;
}
if (p.event.mark) {
this.drawMarkChip(p);
continue;
}
const x = Math.min(p.x0, p.x1);
const w = Math.max(2, Math.abs(p.x1 - p.x0));
if (p.x1 < -30 || p.x0 > this.width + 30) continue;
const col = colorOf(p.event.title, p.event.category);
const sel = p.event.id === this.selectedId;
const hov = p.event.id === this.hoverId;
const fade = this.chipAlpha(p.event.id);
ctx.save();
roundRect(ctx, x, p.y, w, p.h, 5);
ctx.fillStyle = col;
ctx.globalAlpha = fade * (sel ? .98 : hov ? .92 : .86);
ctx.fill();
if (sel) {
ctx.strokeStyle = C.selection;
ctx.lineWidth = 1.5;
ctx.globalAlpha = 1;
ctx.stroke();
}
if (w > 36) {
ctx.font = `500 12px ${FONT_UI}`;
ctx.fillStyle = inkOn(col);
ctx.textAlign = "left";
ctx.textBaseline = "middle";
ctx.globalAlpha = .92;
ctx.save();
ctx.beginPath();
ctx.rect(x + 6, p.y, w - 12, p.h);
ctx.clip();
ctx.fillText(p.event.title, x + 9, p.y + p.h / 2 + .5);
ctx.restore();
}
if (w > 28) this.drawChipHandles(x, p.y, w, p.h, p.event.id, fade, sel, inkOn(col));
ctx.restore();
}
for (const [id, pose] of this.chipPose) {
if (live.has(id) || pose.a < 0.03) continue;
const g = pose.ghost;
g.y = pose.y;
g.h = pose.h;
if (g.event.mark) this.drawMarkChip(g);
else if (g.clustered) this.drawCluster(g);
}
}
drawCluster(p: PlacedChip) {
const { ctx } = this;
const x = (p.x0 + p.x1) / 2;
const ly = this.lineY();
ctx.save();
ctx.fillStyle = colorOf(p.event.title, p.event.category);
ctx.globalAlpha = .9 * this.chipAlpha(p.event.id);
ctx.beginPath();
ctx.arc(x, ly, 2.4, 0, Math.PI * 2);
ctx.fill();
if (p.clusterCount > 1 && this.spanMs < 3456e7) {
ctx.font = `500 9px ${FONT_MONO}`;
ctx.fillStyle = C.muted;
ctx.textAlign = "center";
ctx.textBaseline = "bottom";
ctx.globalAlpha = .7;
ctx.fillText(String(p.clusterCount), x, ly - 8);
}
ctx.restore();
}
drawMilestones(ly: number) {
const { ctx } = this;
const live = new Set<string>();
const drawOne = (p: PlacedChip) => {
const x = (p.x0 + p.x1) / 2;
if (x < -20 || x > this.width + 20) return;
const sel = p.event.id === this.selectedId;
const fade = this.chipAlpha(p.event.id);
ctx.save();
if (p.event.mark) {
const ghost = (p.event.cancelled ? 0.4 : 1) * fade;
ctx.globalAlpha = ghost;
drawGlyph(ctx, this.glyphFlags(p.event, 18, x, ly, C.bg));
if (sel) {
ctx.strokeStyle = C.selection;
ctx.globalAlpha = fade;
ctx.beginPath();
ctx.arc(x, ly, 12, 0, Math.PI * 2);
ctx.stroke();
}
} else {
ctx.translate(x, ly);
ctx.rotate(Math.PI / 4);
ctx.fillStyle = colorOf(p.event.title, p.event.category);
ctx.globalAlpha = fade;
ctx.fillRect(-4, -4, 8, 8);
if (sel) {
ctx.strokeStyle = C.selection;
ctx.strokeRect(-4, -4, 8, 8);
}
}
ctx.restore();
if (p.event.mark || Math.abs(this.timeToX(p.event.start + 3456e6) - x) > 70) {
ctx.font = `500 11px ${FONT_DISPLAY}`;
ctx.fillStyle = C.muted;
ctx.textAlign = "center";
ctx.textBaseline = "top";
ctx.globalAlpha = 0.85 * fade;
ctx.fillText(p.event.title, x, ly + 12);
}
};
for (const p of this.placed) {
if (p.event.kind !== "milestone") continue;
live.add(p.event.id);
drawOne(p);
}
for (const [id, pose] of this.chipPose) {
if (live.has(id) || pose.ghost.event.kind !== "milestone") continue;
pose.ghost.y = pose.y;
drawOne(pose.ghost);
}
}
drawNowHead(nowX: number, ly: number) {
if (nowX < -10 || nowX > this.width + 10) return;
const { ctx, height } = this;
ctx.save();
ctx.strokeStyle = C.now;
ctx.globalAlpha = .55;
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(nowX + .5, 0);
ctx.lineTo(nowX + .5, height);
ctx.stroke();
ctx.globalAlpha = 1;
ctx.fillStyle = C.now;
ctx.beginPath();
ctx.moveTo(nowX, ly - 7);
ctx.lineTo(nowX - 5.5, ly - 16);
ctx.lineTo(nowX + 5.5, ly - 16);
ctx.closePath();
ctx.fill();
ctx.restore();
}
drawSnap(t: number, ly: number) {
const x = this.timeToX(t);
const { ctx, height } = this;
ctx.save();
ctx.strokeStyle = C.snap;
ctx.setLineDash([3, 4]);
ctx.beginPath();
ctx.moveTo(x + .5, 0);
ctx.lineTo(x + .5, height);
ctx.stroke();
ctx.restore();
}
drawHoverTip() {
this.ctx.letterSpacing = "0px";
if (this.sunHoverA > .012 && this.hoverSun) this.drawSunCursor(this.hoverSun.px, this.hoverSun.py);
if (this.moonHoverA > .012 && this.hoverMoon) this.drawMoonZenith();
if (this.mode === "none" && this.sunHover && this.hoverSun && !this.hoverId) {
this.drawSunTip();
return;
}
if (this.mode === "none" && this.moonHover && this.hoverMoon && !this.hoverId) {
this.drawMoonTip();
return;
}
const editing = this.mode === "drag-event" || this.mode === "resize-start" || this.mode === "resize-end";
const id = editing ? this.dragId : this.mode === "none" ? this.hoverId : null;
if (!id) return;
const ev = this.events.find((e: CalEvent) => e.id === id);
if (!ev) return;
const clustered = !editing ? this.placed.find((c: PlacedChip) => c.event.id === id)?.clustered ?? false : false;
const clusterCount = this.placed.find((c: PlacedChip) => c.event.id === id)?.clusterCount ?? 1;
const { ctx } = this;
ctx.letterSpacing = "0px";
const title = clustered ? `${clusterCount} events` : ev.title;
const sub = clustered ? "" : formatRange(ev.start, ev.end);
const durMs = Math.max(0, ev.end - ev.start);
const mins = Math.round(durMs / 6e4);
const dur = editing && !clustered ? mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}` : "";
ctx.font = `500 12px ${FONT_UI}`;
const w1 = ctx.measureText(title).width;
ctx.font = `400 11px ${FONT_UI}`;
const w2 = sub ? ctx.measureText(sub).width : 0;
const w3 = dur ? ctx.measureText(dur).width : 0;
const mark = clustered ? undefined : ev.mark;
const gSize = 16;
const gPad = mark ? gSize + 14 : 10;
const w = Math.max(w1, w2, w3) + gPad + 10;
const h = dur ? 54 : sub ? 40 : 28;
let x = this.cursorX + 14;
let y = this.cursorY + 16;
if (x + w > this.width - 8) x = this.cursorX - w - 12;
if (y + h > this.bandHeight() - 8) y = this.cursorY - h - 14;
x = clamp(x, 8, this.width - w - 8);
y = clamp(y, 8, this.bandHeight() - h - 8);
ctx.save();
ctx.fillStyle = C.bgElevated;
roundRect(ctx, x, y, w, h, 6);
ctx.fill();
ctx.strokeStyle = C.line;
ctx.stroke();
if (mark) {
drawGlyph(ctx, this.glyphFlags(ev, gSize, x + 8 + gSize / 2, y + (sub || dur ? 14 : h / 2), C.bgElevated));
}
ctx.fillStyle = C.fg;
ctx.font = `500 12px ${FONT_UI}`;
ctx.textAlign = "left";
ctx.textBaseline = "top";
ctx.fillText(title, x + gPad, y + 6);
if (sub) {
ctx.fillStyle = C.muted;
ctx.font = `400 11px ${FONT_UI}`;
ctx.fillText(sub, x + gPad, y + 22);
}
if (dur) {
ctx.fillStyle = C.subtle;
ctx.font = `400 11px ${FONT_UI}`;
ctx.fillText(dur, x + gPad, y + 36);
}
ctx.restore();
}
drawSunTip() {
const sun = this.hoverSun;
if (!sun) return;
const { ctx } = this;
const rise = formatHm(sun.rise);
const set = formatHm(sun.set);
ctx.font = `400 11px ${FONT_MONO}`;
const tw = Math.max(ctx.measureText(rise).width, ctx.measureText(set).width);
const icon = 12;
const gap = 6;
const row = 16;
const w = icon + gap + tw + 20;
const h = row * 2 + 12;
let x = this.cursorX + 14;
let y = this.cursorY + 16;
if (x + w > this.width - 8) x = this.cursorX - w - 12;
if (y + h > this.bandHeight() - 8) y = this.cursorY - h - 14;
x = clamp(x, 8, this.width - w - 8);
y = clamp(y, 8, this.bandHeight() - h - 8);
ctx.save();
ctx.fillStyle = C.bgElevated;
roundRect(ctx, x, y, w, h, 6);
ctx.fill();
ctx.strokeStyle = C.line;
ctx.stroke();
ctx.fillStyle = C.muted;
ctx.font = `400 11px ${FONT_MONO}`;
ctx.textAlign = "left";
ctx.textBaseline = "middle";
const y1 = y + 6 + row / 2;
const y2 = y + 6 + row + row / 2;
drawHorizonSun(ctx, x + 8, y1, icon, "rise", C.muted);
ctx.fillText(rise, x + 8 + icon + gap, y1);
drawHorizonSun(ctx, x + 8, y2, icon, "set", C.muted);
ctx.fillText(set, x + 8 + icon + gap, y2);
ctx.restore();
}
drawSunCursor(cx: number, cy: number) {
const { ctx } = this;
const a = smoothstep(this.sunHoverA);
const r = lerp(9, 13, a);
const rot = ((this.lastTs % 6000) / 6000) * Math.PI * 2;
ctx.save();
ctx.translate(cx, cy);
ctx.rotate(rot);
ctx.globalAlpha = a;
ctx.fillStyle = rgbCss(sunRgb(this.xToTime(cx)));
ctx.beginPath();
ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
ctx.fill();
ctx.beginPath();
for (let i = 0; i < 8; i++) {
const ang = (i * Math.PI) / 4;
const c = Math.cos(ang);
const s = Math.sin(ang);
const p = Math.cos(ang + Math.PI / 2);
const q = Math.sin(ang + Math.PI / 2);
ctx.moveTo(c * r, s * r);
ctx.lineTo(c * r * 0.5 + p * r * 0.15, s * r * 0.5 + q * r * 0.15);
ctx.lineTo(c * r * 0.5 - p * r * 0.15, s * r * 0.5 - q * r * 0.15);
ctx.closePath();
}
ctx.fill();
ctx.restore();
}
drawMoonTip() {
const moon = this.hoverMoon;
if (!moon) return;
const { ctx } = this;
const name = moonPhaseName(moon.rise);
const rise = formatHm(moon.rise);
const set = formatHm(moon.set);
ctx.font = `500 12px ${FONT_UI}`;
const titleW = ctx.measureText(name).width;
ctx.font = `400 11px ${FONT_MONO}`;
const tw = Math.max(ctx.measureText(rise).width, ctx.measureText(set).width);
const icon = 12;
const gap = 6;
const row = 16;
const titleRow = 20;
const w = Math.max(titleW, icon + gap + tw) + 20;
const h = titleRow + row * 2 + 12;
let x = this.cursorX + 14;
let y = this.cursorY + 16;
if (x + w > this.width - 8) x = this.cursorX - w - 12;
if (y + h > this.bandHeight() - 8) y = this.cursorY - h - 14;
x = clamp(x, 8, this.width - w - 8);
y = clamp(y, 8, this.bandHeight() - h - 8);
ctx.save();
ctx.fillStyle = C.bgElevated;
roundRect(ctx, x, y, w, h, 6);
ctx.fill();
ctx.strokeStyle = C.line;
ctx.stroke();
ctx.textAlign = "left";
ctx.textBaseline = "middle";
ctx.fillStyle = C.fg;
ctx.font = `500 12px ${FONT_UI}`;
ctx.fillText(name, x + 10, y + 6 + titleRow / 2);
ctx.fillStyle = C.muted;
ctx.font = `400 11px ${FONT_MONO}`;
const y1 = y + titleRow + 4 + row / 2;
const y2 = y1 + row;
drawHorizonMoon(ctx, x + 8, y1, icon, "rise", C.muted);
ctx.fillText(rise, x + 8 + icon + gap, y1);
drawHorizonMoon(ctx, x + 8, y2, icon, "set", C.muted);
ctx.fillText(set, x + 8 + icon + gap, y2);
ctx.restore();
}
drawMoonZenith() {
if (this.skyK() < 0.15 || this.moonVisA < .2) return;
const t = this.xToTime(this.cursorX);
const p = moonPassage(t);
const cands = [p, moonPassage(p.rise - 1), moonPassage(p.set + 1)];
let best = p;
let bestD = Infinity;
for (const c of cands) {
const x = this.timeToX(c.transit);
const d = Math.abs(x - this.cursorX);
if (d < bestD) {
bestD = d;
best = c;
}
}
const a = smoothstep(this.moonHoverA);
this.paintMoonAt(best.transit, lerp(5.5, 7.5, a), a);
}
}
