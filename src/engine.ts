export type { EngineHost, EngineOptions } from "./engine-core";
import { EngineDraw } from "./engine-draw";
import type { CalEvent, PlacedChip } from "./types";
import { C, colorOf, FONT_DISPLAY, FONT_MONO, FONT_UI, inkOn } from "./theme";
import { clamp, formatHm, formatRange, lerp, smoothstep, DAY } from "./time";
import { drawGlyph } from "./glyphDraw";
import { drawHorizonSun, roundRect } from "./engine-util";

export class DaylineEngine extends EngineDraw {
constructor(canvas: HTMLCanvasElement, host: import("./engine-core").EngineHost, opts: import("./engine-core").EngineOptions = {}) {
super(canvas, host, opts);
this.startLoop();
}
draw() {
const { ctx, width, height } = this;
ctx.fillStyle = C.bg;
ctx.fillRect(0, 0, width, height);
const ly = this.lineY();
const nowX = this.timeToX(this.now);
this.drawNowWash(nowX, ly);
this.drawMinimap();
this.drawSun(ly);
this.drawCoil(ly);
this.drawLine(ly);
this.drawTicks(ly);
this.drawBands(ly);
this.drawChips();
this.drawMilestones(ly);
this.drawNowHead(nowX, ly);
if (this.snapGuide != null) this.drawSnap(this.snapGuide, ly);
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
drawGlyph(ctx, {
kind: mark.glyph.kind,
accent: col,
bg: C.bg,
size: gSize,
cx: gx,
cy: gy,
ongoing: !!(e.ongoing || mark.glyph.ongoing),
flip180: !!mark.glyph.flip180,
done: !!mark.glyph.done,
cancelled: !!(e.cancelled || mark.glyph.cancelled),
filled: !!mark.glyph.done,
scheduled: mark.track === "planned" && !e.ongoing && e.start > this.now && !mark.glyph.done,
timeMs: performance.now(),
reducedMotion: this.reducedMotion,
});
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
if (sel && w > 28 && !e.point) {
ctx.globalAlpha = ghost;
ctx.fillStyle = C.handle;
roundRect(ctx, x + 1, p.y + 5, 4, p.h - 10, 1);
ctx.fill();
roundRect(ctx, x + w - 5, p.y + 5, 4, p.h - 10, 1);
ctx.fill();
}
ctx.restore();
}
chipAlpha(id: string): number {
return this.chipPose.get(id)?.a ?? 1;
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
if (sel && w > 28) {
ctx.globalAlpha = 1;
ctx.fillStyle = inkOn(col);
roundRect(ctx, x + 1, p.y + 5, 4, p.h - 10, 1);
ctx.fill();
roundRect(ctx, x + w - 5, p.y + 5, 4, p.h - 10, 1);
ctx.fill();
}
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
const col = this.accentOf(p.event);
const ghost = (p.event.cancelled ? 0.4 : 1) * fade;
ctx.globalAlpha = ghost;
drawGlyph(ctx, {
kind: p.event.mark.glyph.kind,
accent: col,
bg: C.bg,
size: 18,
cx: x,
cy: ly,
ongoing: !!(p.event.ongoing || p.event.mark.glyph.ongoing),
flip180: !!p.event.mark.glyph.flip180,
done: !!p.event.mark.glyph.done,
cancelled: !!(p.event.cancelled || p.event.mark.glyph.cancelled),
filled: !!p.event.mark.glyph.done,
scheduled: p.event.start > this.now,
timeMs: performance.now(),
reducedMotion: this.reducedMotion,
});
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
const { ctx } = this;
ctx.save();
ctx.strokeStyle = C.now;
ctx.globalAlpha = .55;
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(nowX + .5, 8);
ctx.lineTo(nowX + .5, ly + 28);
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
const { ctx } = this;
ctx.save();
ctx.strokeStyle = C.snap;
ctx.setLineDash([3, 4]);
ctx.beginPath();
ctx.moveTo(x + .5, ly - 130);
ctx.lineTo(x + .5, ly + 36);
ctx.stroke();
ctx.restore();
}
drawMinimap() {
const { ctx, width, height } = this;
const y = height - 28;
const h = 14;
const { min, max } = this.bounds();
const span = max - min || 1;
ctx.fillStyle = C.bgElevated;
roundRect(ctx, 8, y, width - 16, h, 3);
ctx.fill();
ctx.save();
ctx.beginPath();
roundRect(ctx, 8, y, width - 16, h, 3);
ctx.clip();
for (const e of this.events) {
const x0 = 8 + (e.start - min) / span * (width - 16);
const x1 = 8 + (e.end - min) / span * (width - 16);
ctx.fillStyle = this.accentOf(e);
ctx.globalAlpha = e.kind === "band" ? .28 : .55;
ctx.fillRect(x0, y + 2, Math.max(1, x1 - x0), 10);
}
ctx.globalAlpha = 1;
const vx0 = 8 + (this.tLeft() - min) / span * (width - 16);
const vx1 = 8 + (this.tRight() - min) / span * (width - 16);
ctx.strokeStyle = C.selection;
ctx.globalAlpha = .7;
ctx.lineWidth = 1;
ctx.strokeRect(Math.min(vx0, vx1), y + .5, Math.max(8, Math.abs(vx1 - vx0)), 13);
const nx = 8 + (this.now - min) / span * (width - 16);
ctx.globalAlpha = .9;
ctx.fillStyle = C.now;
ctx.fillRect(nx - .5, y, 1, h);
ctx.restore();
}
drawHoverTip() {
if (this.sunHoverA > .012 && this.hoverSun) this.drawSunCursor(this.hoverSun.px, this.hoverSun.py);
if (this.mode === "none" && this.sunHover && this.hoverSun && !this.hoverId) {
this.drawSunTip();
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
const title = clustered ? `${clusterCount} events` : ev.title;
const sub = clustered ? "" : formatRange(ev.start, ev.end);
const durMs = Math.max(0, ev.end - ev.start);
const mins = Math.round(durMs / 6e4);
const dur = editing && !clustered ? mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}` : "";
ctx.font = `500 12px ${FONT_UI}`;
const w1 = ctx.measureText(title).width;
ctx.font = `400 11px ${FONT_MONO}`;
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
if (y + h > this.height - 8) y = this.cursorY - h - 14;
x = clamp(x, 8, this.width - w - 8);
y = clamp(y, 8, this.height - h - 8);
ctx.save();
ctx.fillStyle = C.bgElevated;
roundRect(ctx, x, y, w, h, 6);
ctx.fill();
ctx.strokeStyle = C.line;
ctx.stroke();
if (mark) {
drawGlyph(ctx, {
kind: mark.glyph.kind,
accent: this.accentOf(ev),
bg: C.bgElevated,
size: gSize,
cx: x + 8 + gSize / 2,
cy: y + (sub || dur ? 14 : h / 2),
ongoing: !!(ev.ongoing || mark.glyph.ongoing),
flip180: !!mark.glyph.flip180,
done: !!mark.glyph.done,
cancelled: !!(ev.cancelled || mark.glyph.cancelled),
filled: !!mark.glyph.done,
scheduled: mark.track === "planned" && !ev.ongoing && ev.start > this.now && !mark.glyph.done,
timeMs: this.lastTs,
reducedMotion: this.reducedMotion,
});
}
ctx.fillStyle = C.fg;
ctx.font = `500 12px ${FONT_UI}`;
ctx.textAlign = "left";
ctx.textBaseline = "top";
ctx.fillText(title, x + gPad, y + 6);
if (sub) {
ctx.fillStyle = C.muted;
ctx.font = `400 11px ${FONT_MONO}`;
ctx.fillText(sub, x + gPad, y + 22);
}
if (dur) {
ctx.fillStyle = C.subtle;
ctx.font = `400 11px ${FONT_MONO}`;
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
if (y + h > this.height - 8) y = this.cursorY - h - 14;
x = clamp(x, 8, this.width - w - 8);
y = clamp(y, 8, this.height - h - 8);
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
ctx.fillStyle = C.travel;
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

}
