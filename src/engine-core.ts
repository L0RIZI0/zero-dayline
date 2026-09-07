import type {
  CalEvent,
  DaylineSnapshot,
  EventCategory,
  EventKind,
  PlacedChip,
  PointerMode,
  TickMark,
  TickUnit,
} from "./types";
import {
  MAX_SPAN_MS,
  MIN_EVENT_MS,
  MIN_SPAN_MS,
  SETTINGS_KEY,
} from "./types";
import { C, applyChrome, colorOf, FONT_DISPLAY, FONT_MONO, FONT_UI, inkOn } from "./theme";
import {
  addUnit,
  clamp,
  DAY,
  expDamp,
  floorTo,
  formatHm,
  formatRange,
  HOUR,
  lerp,
  snapTime,
  startOfDay,
  smoothstep,
  unitApproxMs,
} from "./time";
import {
  BUSY_WEIGHT,
  emptyWeightForSpan,
  hannCum,
  lensAmpForSpan,
  lensDensity,
  nowLensHalfWidth,
  WarpField,
} from "./warp";
import { buildTicks, coilUnit, labelLane, type LabelLane } from "./ticks";
import { loadEvents, saveEvents, seedCalendar } from "./seed";
import { seasonSigned, sunTimes, sunUnit } from "./sun";
import type {
  DaylineCallbacks,
  DaylineData,
  DaylineTheme,
} from "./contract";
import { marksToEvents } from "./marks";
import { ongoingAngle } from "./glyphDraw";
import { SPIN } from "./glyphs";

export type EngineHost = {
  onChange: (s: DaylineSnapshot) => void;
};

export type EngineOptions = {
  persist?: boolean;
  clock?: "wall" | "data";
  data?: DaylineData;
  theme?: DaylineTheme;
  callbacks?: DaylineCallbacks;
  nowRestFraction?: number;
  dpr?: number;
  source?: "demo" | "sample";
};

type Settings = { warpStrength: number; nowLens: boolean };
type FadeLabel = {
id: string;
x: number;
text: string;
lane: LabelLane;
unit: TickUnit;
a: number;
};
export type Hit = {
chip: PlacedChip | null;
handle: "start" | "end" | null;
minimap: boolean;
};

function loadSettings(): Settings {
try {
const raw = localStorage.getItem(SETTINGS_KEY);
if (!raw) return { warpStrength: .9, nowLens: true };
const p = JSON.parse(raw);
return {
warpStrength: clamp(p.warpStrength ?? .9, 0, 1),
nowLens: p.nowLens !== false
};
} catch {
return { warpStrength: .9, nowLens: true };
}
}
function saveSettings(s: Settings) {
try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}
export const LANE_ORDER: LabelLane[] = ["time", "day", "month", "year"];
export const LANE_ROW = 17;

export type GlyphFx = {
spinOnceAt?: number;
flashAt?: number;
flashDur?: number;
seenSpinOnce?: number;
seenFlash?: number;
ongoingSince?: number;
landingFrom?: number;
landingAt?: number;
wasOngoing?: boolean;
};

export interface EngineCore {
frame(ts: number): void;
rebuildWarp(): void;
collectTicks(): void;
stepLabelLanes(dt: number): void;
stepLabelFade(dt: number): void;
draw(): void;
layout(): import("./types").PlacedChip[];
emit(): void;
setAnchor(t: number, x: number): void;
noteGesture(x: number): void;
springTo(center: number, span: number): void;
panBy(dx: number): void;
bounds(): { min: number; max: number };
pushUndo(): void;
onDown(e: PointerEvent): void;
onMove(e: PointerEvent): void;
onUp(e: PointerEvent): void;
onLeave(): void;
onWheel(e: WheelEvent): void;
onMenu(e: MouseEvent): void;
onKey(e: KeyboardEvent): void;
hitSun(x: number, y: number): { rise: number; set: number; px: number; py: number } | null;
hitMoon(x: number, y: number): { rise: number; set: number; px: number; py: number } | null;
}

export class EngineCore {
canvas: HTMLCanvasElement;
ctx: CanvasRenderingContext2D;
host: EngineHost;
raf = 0;
running = false;
dpr = 1;
width = 0;
height = 0;
events: CalEvent[] = [];
selectedId: string | null = null;
hoverId: string | null = null;
hoverHandle: "start" | "end" | null = null;
cursorT: number | null = null;
warpStrength: number;
nowLensOn: boolean;
reducedMotion = false;
warp = new WarpField();
displayedEmpty = .2;
displayedLensAmp = 0;
now = Date.now();
centerT = this.now;
spanMs = 5 * DAY;
targetCenter = this.now;
targetSpan = 5 * DAY;
lagCenter = this.now;
lagSpan = 5 * DAY;
mapDirty = true;
liveA = 0;
liveDen = 1;
lagA = 0;
lagDen = 1;
lagClose = true;
lensNow = 0;
lensHalf = 1;
lensAmp = 0;
mapFocusX = 0;
mapSigma2 = 1;
textW = new Map<string, number>();
centerVel = 0;
logSpanVel = 0;
zoomCoast = 0;
springing = false;
coastPx = 0;
slidePx = 0;
slideZoomLog = 0;
wheelX = 0;
flickT: number | null = null;
flickX = 0;
flickV = 0;
focusX = 0;
gestureAt = 0;
mode: PointerMode = "none";
ptrs = new Map<number, { id: number; x: number; y: number }>();
grabT = 0;
grabX = 0;
lastX = 0;
lastT = 0;
cursorX = 0;
cursorY = 0;
dragOrigin: CalEvent[] = [];
dragId: string | null = null;
pinchDist0 = 0;
pinchSpan0 = 1;
pinchT = 0;
pinchX = 0;
moved = false;
lastClickAt = 0;
lastClickX = 0;
emptyDown = false;
velBuf: { t: number; x: number }[] = [];
dragSign = 0;
placed: PlacedChip[] = [];
chipPose = new Map<string, { y: number; h: number; a: number; ghost: PlacedChip }>();
ticks: TickMark[] = [];
snapGuide: number | null = null;
undo: string[] = [];
redo: string[] = [];
lastEmitKey = "";
lastTs = 0;
dirtyWarp = true;
ro: ResizeObserver | null = null;
needsResize = true;
hostBox: { w: number; h: number } | null = null;
lanesInited = false;
chipsInited = false;
labelAnchor = 80;
laneY: Record<LabelLane, number> = {
time: 80,
day: 64,
month: 48,
year: 32
};
laneA: Record<LabelLane, number> = {
time: 0,
day: 0,
month: 0,
year: 0
};
labelFade = new Map<string, FadeLabel>();
sunPts: { x: number; y: number }[] = [];
sunHover = false;
sunHoverA = 0;
hoverSun: { rise: number; set: number; px: number; py: number } | null = null;
moonPts: { x: number; y: number }[] = [];
moonHover = false;
moonHoverA = 0;
hoverMoon: { rise: number; set: number; px: number; py: number } | null = null;
showSun = true;
showMoon = false;
persistEvents = true;
clockMode: "wall" | "data" = "wall";
nowRestFraction = 0.5;
callbacks: DaylineCallbacks = {};
bootData: DaylineData | null = null;
pendingData: DaylineData | null = null;
source: "demo" | "sample" = "demo";
lastIntent: string | null = null;
glyphFx = new Map<string, GlyphFx>();
constructor(canvas: HTMLCanvasElement, host: EngineHost, opts: EngineOptions = {}) {
this.canvas = canvas;
canvas.style.display = "block";
canvas.style.width = "100%";
canvas.style.height = "100%";
const ctx = canvas.getContext("2d", { alpha: false });
if (!ctx) throw new Error("Canvas 2D unavailable");
this.ctx = ctx;
this.host = host;
const settings = loadSettings();
this.warpStrength = settings.warpStrength;
this.nowLensOn = settings.nowLens;
this.reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
this.persistEvents = opts.persist !== false && !opts.data;
this.clockMode = opts.clock ?? "wall";
this.nowRestFraction = opts.nowRestFraction ?? (opts.data ? 1 / 3 : 0.5);
this.callbacks = opts.callbacks ?? {};
this.bootData = opts.data ?? null;
this.source = opts.source ?? (opts.data ? "sample" : "demo");
if (opts.theme) this.applyTheme(opts.theme);
this.now = opts.data?.now ?? Date.now();
this.events = [];
this.centerT = this.now;
this.targetCenter = this.now;
this.lagCenter = this.now;
this.spanMs = 5.5 * DAY;
this.targetSpan = this.spanMs;
this.lagSpan = this.spanMs;
this.displayedEmpty = emptyWeightForSpan(this.spanMs, this.warpStrength);
this.displayedLensAmp = this.nowLensOn ? lensAmpForSpan(this.spanMs) : 0;
this.focusX = 0;
this.gestureAt = performance.now();
}
protected startLoop() {
this.bind();
this.resize();
this.rebuildWarp();
this.running = true;
this.lastTs = performance.now();
if (this.width >= 16 && this.height >= 16) {
this.collectTicks();
this.stepLabelLanes(1);
this.stepLabelFade(1);
this.draw();
}
this.raf = requestAnimationFrame(this.frame);
queueMicrotask(() => this.hydrate());
}
destroy() {
this.running = false;
cancelAnimationFrame(this.raf);
this.unbind();
this.ro?.disconnect();
}
snapshot(): DaylineSnapshot {
const selected = this.events.find((e: CalEvent) => e.id === this.selectedId) ?? null;
return {
spanMs: this.spanMs,
centerT: this.centerT,
hoverId: this.hoverId,
selectedId: this.selectedId,
cursorT: this.cursorT,
warp: this.warpStrength,
nowLens: this.nowLensOn,
now: this.now,
eventCount: this.events.length,
selected,
source: this.source,
lastIntent: this.lastIntent
};
}
setWarpStrength(v: number) {
this.warpStrength = clamp(v, 0, 1);
saveSettings({
warpStrength: this.warpStrength,
nowLens: this.nowLensOn
});
this.dirtyWarp = true;
this.emit();
}
setNowLens(on: boolean) {
this.nowLensOn = on;
saveSettings({
warpStrength: this.warpStrength,
nowLens: this.nowLensOn
});
this.emit();
}
goToNow() {
const restX = this.width * this.nowRestFraction;
this.noteGesture(restX);
const span = clamp(this.spanMs, 8 * HOUR, 8 * DAY);
const center = this.now - (this.nowRestFraction - 0.5) * span;
this.springTo(center, span);
}
jumpSpan(spanMs: number) {
this.noteGesture(this.width / 2);
this.springTo(this.centerT, clamp(spanMs, MIN_SPAN_MS, MAX_SPAN_MS));
}
jumpLife() {
const { min, max } = this.bounds();
this.noteGesture(this.width / 2);
this.springTo((min + max) / 2, clamp(max - min, MIN_SPAN_MS, MAX_SPAN_MS));
}
panPixels(dx: number) {
this.springing = false;
this.coastPx = 0;
this.slidePx = 0;
this.slideZoomLog = 0;
this.flickT = null;
this.flickV = 0;
this.panBy(dx);
}
resetDemo() {
this.pushUndo();
if (this.bootData) {
this.loadData(this.bootData);
this.springTo(this.now - (this.nowRestFraction - 0.5) * 5.5 * DAY, 5.5 * DAY);
this.emit();
return;
}
this.now = Date.now();
this.events = seedCalendar(this.now);
this.persist();
this.selectedId = null;
this.dirtyWarp = true;
this.springTo(this.now, 5.5 * DAY);
this.emit();
}
undoLast() {
const prev = this.undo.pop();
if (!prev) return;
this.redo.push(JSON.stringify(this.events));
this.events = JSON.parse(prev);
this.persist();
this.dirtyWarp = true;
this.emit();
}
redoLast() {
const next = this.redo.pop();
if (!next) return;
this.undo.push(JSON.stringify(this.events));
this.events = JSON.parse(next);
this.persist();
this.dirtyWarp = true;
this.emit();
}
updateSelected(patch: Partial<CalEvent>) {
if (!this.selectedId) return;
this.pushUndo();
this.events = this.events.map((e: CalEvent) => e.id === this.selectedId ? {
...e,
...patch
} : e);
this.persist();
this.dirtyWarp = true;
this.emit();
}
deleteSelected() {
if (!this.selectedId) return;
const id = this.selectedId;
this.pushUndo();
const drop = new Set([id]);
let grew = true;
while (grew) {
grew = false;
for (const e of this.events) if (e.parentId && drop.has(e.parentId) && !drop.has(e.id)) {
drop.add(e.id);
grew = true;
}
}
this.events = this.events.filter((e) => !drop.has(e.id));
this.selectedId = null;
this.persist();
this.dirtyWarp = true;
this.emit();
}
bind() {
const el = this.canvas;
el.addEventListener("pointerdown", this.onDown);
el.addEventListener("pointermove", this.onMove);
el.addEventListener("pointerup", this.onUp);
el.addEventListener("pointercancel", this.onUp);
el.addEventListener("pointerleave", this.onLeave);
el.addEventListener("wheel", this.onWheel, { passive: false });
el.addEventListener("contextmenu", this.onMenu);
window.addEventListener("keydown", this.onKey);
this.ro = new ResizeObserver(() => {
this.needsResize = true;
if (this.running) this.resize();
});
if (el.parentElement) this.ro.observe(el.parentElement);
else this.ro.observe(el);
window.addEventListener("resize", this.onWinResize);
}
unbind() {
const el = this.canvas;
el.removeEventListener("pointerdown", this.onDown);
el.removeEventListener("pointermove", this.onMove);
el.removeEventListener("pointerup", this.onUp);
el.removeEventListener("pointercancel", this.onUp);
el.removeEventListener("pointerleave", this.onLeave);
el.removeEventListener("wheel", this.onWheel);
el.removeEventListener("contextmenu", this.onMenu);
window.removeEventListener("keydown", this.onKey);
window.removeEventListener("resize", this.onWinResize);
}
onWinResize = () => {
this.needsResize = true;
};
hydrate() {
if (!this.running) return;
if (this.bootData) {
this.loadData(this.bootData);
return;
}
this.events = loadEvents(this.now);
this.dirtyWarp = true;
this.rebuildWarp();
this.placed = this.layout();
this.collectTicks();
this.stepLabelLanes(1);
this.stepLabelFade(1);
if (this.width >= 16 && this.height >= 16) this.draw();
this.emit();
}
persist() {
if (this.persistEvents) saveEvents(this.events);
}
loadData(data: DaylineData) {
this.bootData = data;
if (this.clockMode === "data") this.now = data.now;
else this.now = Date.now();
const dragging =
this.mode === "drag-event" || this.mode === "resize-start" || this.mode === "resize-end";
if (dragging) {
this.pendingData = data;
return;
}
this.pendingData = null;
const prevIds = new Set(this.events.map((e) => e.id));
const keepView = this.events.length > 0;
this.events = marksToEvents(data);
this.noteGlyphFx(prevIds, keepView);
this.showSun = data.sky?.sun !== false;
this.showMoon = !!data.sky?.moon;
for (const e of this.events) if (e.openEnded) e.end = this.now;
this.dirtyWarp = true;
this.rebuildWarp();
this.placed = this.layout();
this.collectTicks();
if (!keepView && this.width >= 16) {
const restX = this.width * this.nowRestFraction;
this.setAnchor(this.now, restX);
this.targetCenter = this.centerT;
this.lagCenter = this.centerT;
this.focusX = restX;
}
this.stepLabelLanes(1);
this.stepLabelFade(1);
if (this.width >= 16 && this.height >= 16) this.draw();
this.emit();
}
noteGlyphFx(prevIds: Set<string>, keepView: boolean) {
const now = performance.now();
const live = new Set<string>();
for (const e of this.events) {
const mark = e.mark;
if (!mark) continue;
live.add(e.id);
const fx = this.glyphFx.get(e.id) ?? {};
const ongoing = !!(e.ongoing || mark.glyph.ongoing);
if (mark.glyph.spinOnce != null) {
if (fx.seenSpinOnce != null && mark.glyph.spinOnce > fx.seenSpinOnce && !this.reducedMotion) {
fx.spinOnceAt = now;
fx.flashAt = now;
fx.flashDur = SPIN.fullTurnMs;
}
fx.seenSpinOnce = mark.glyph.spinOnce;
}
if (mark.glyph.flashFill != null) {
if (fx.seenFlash != null && mark.glyph.flashFill > fx.seenFlash && !this.reducedMotion) {
fx.flashAt = now;
fx.flashDur = SPIN.flashMs;
}
fx.seenFlash = mark.glyph.flashFill;
}
if (keepView && !prevIds.has(e.id) && !this.reducedMotion) {
const instant = !!(e.point || mark.instant || mark.kind === "instant" || mark.glyph.kind === "instant");
fx.flashAt = now;
if (instant) {
fx.spinOnceAt = now;
fx.flashDur = SPIN.fullTurnMs;
} else {
fx.flashDur = SPIN.flashMs;
}
}
if (fx.wasOngoing && !ongoing && !this.reducedMotion) {
fx.landingFrom = fx.ongoingSince != null ? ongoingAngle(now - fx.ongoingSince) : 0;
fx.landingAt = now;
fx.ongoingSince = undefined;
fx.flashAt = now;
fx.flashDur = SPIN.flashMs;
}
if (!fx.wasOngoing && ongoing) {
fx.ongoingSince = now;
fx.landingAt = undefined;
fx.spinOnceAt = undefined;
}
fx.wasOngoing = ongoing;
this.glyphFx.set(e.id, fx);
}
for (const id of [...this.glyphFx.keys()]) if (!live.has(id)) this.glyphFx.delete(id);
}
setContractTheme(theme: DaylineTheme) {
this.applyTheme(theme);
}
applyTheme(theme: DaylineTheme) {
applyChrome(theme);
}
resizeTo(width: number, height: number) {
this.hostBox = { w: Math.max(0, width), h: Math.max(0, height) };
this.needsResize = true;
this.resize();
}
setCallbacks(cb: DaylineCallbacks) {
this.callbacks = cb;
}
setRails(rails: { planned?: boolean; recorded?: boolean; access?: boolean }) {
if (!this.bootData) return;
this.loadData({
...this.bootData,
rails: {
...this.bootData.rails,
...rails
}
});
}
accentOf(e: CalEvent): string {
return e.color || e.mark?.glyph.accent || colorOf(e.title, e.category);
}
noteIntent(msg: string) {
this.lastIntent = msg;
this.emit();
}
protected afterResize() {}
resize() {
const parent = this.canvas.parentElement ?? this.canvas;
const r = this.canvas.getBoundingClientRect();
const pr = parent.getBoundingClientRect();
let w: number;
let h: number;
if (this.hostBox) {
w = Math.floor(this.hostBox.w);
h = Math.floor(this.hostBox.h);
} else {
w = Math.floor(Math.max(r.width, pr.width, 0));
h = Math.floor(Math.max(r.height, pr.height, 0));
}
if (w < 16 || h < 16) {
this.needsResize = true;
return;
}
const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
const bw = Math.floor(w * dpr);
const bh = Math.floor(h * dpr);
if (w === this.width && h === this.height && dpr === this.dpr && this.canvas.width === bw && this.canvas.height === bh) {
this.needsResize = false;
return;
}
this.dpr = dpr;
this.width = w;
this.height = h;
this.canvas.width = bw;
this.canvas.height = bh;
this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
this.needsResize = false;
if (this.focusX === 0) this.focusX = w / 2;
this.ctx.fillStyle = C.bg;
this.ctx.fillRect(0, 0, w, h);
this.afterResize();
}
}
