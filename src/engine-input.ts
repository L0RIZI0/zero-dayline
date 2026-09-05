import { EngineLayout } from "./engine-layout";
import type { CalEvent, EventCategory, EventKind, PlacedChip } from "./types";
import { MIN_EVENT_MS, MIN_SPAN_MS, MAX_SPAN_MS } from "./types";
import { clamp, formatRange, HOUR, snapTime } from "./time";
import { wheelNotches } from "./engine-util";

export class EngineInput extends EngineLayout {
onDown = (e: PointerEvent) => {
if (e.button !== 0 && e.pointerType === "mouse") return;
try { this.canvas.setPointerCapture(e.pointerId); } catch {}
const { x, y } = this.localXY(e);
this.cursorX = x;
this.cursorY = y;
this.ptrs.set(e.pointerId, {
id: e.pointerId,
x,
y
});
this.moved = false;
this.emptyDown = false;
this.coastPx = 0;
this.slidePx = 0;
this.slideZoomLog = 0;
this.flickT = null;
this.flickV = 0;
this.zoomCoast = 0;
this.springing = false;
this.velBuf = [];
this.noteGesture(x);
if (this.ptrs.size === 2) {
const [a, b] = [...this.ptrs.values()];
this.mode = "pinch";
this.pinchDist0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
this.pinchSpan0 = this.spanMs;
this.pinchX = (a.x + b.x) / 2;
this.pinchT = this.xToTime(this.pinchX);
return;
}
const hit = this.hitTest(x, y);
if (hit.minimap) {
this.jumpMinimap(x);
this.mode = "pan";
this.grabT = this.xToTime(x);
this.grabX = x;
this.lastX = x;
this.lastT = performance.now();
this.dragSign = 0;
this.pushVel(x);
return;
}
if (hit.handle && hit.chip && !hit.chip.event.point) {
this.pushUndo();
this.mode = hit.handle === "start" ? "resize-start" : "resize-end";
this.dragId = hit.chip.event.id;
this.dragOrigin = this.events.map((ev) => ({ ...ev }));
this.selectedId = hit.chip.event.id;
this.lastX = x;
this.grabX = x;
this.grabT = this.xToTime(x);
return;
}
if (hit.chip && !hit.chip.clustered && !hit.chip.event.locked) {
this.mode = "drag-event";
this.dragId = hit.chip.event.id;
this.grabT = this.xToTime(x) - hit.chip.event.start;
this.dragOrigin = this.events.map((ev) => ({ ...ev }));
this.selectedId = hit.chip.event.id;
this.lastX = x;
this.lastT = performance.now();
this.emit();
return;
}
if (hit.chip) {
this.selectedId = hit.chip.event.id;
this.mode = "pan";
this.grabT = this.xToTime(x);
this.grabX = x;
this.lastX = x;
this.lastT = performance.now();
this.emit();
return;
}
const now = performance.now();
if (now - this.lastClickAt < 320 && Math.abs(x - this.lastClickX) < 8) {
this.createAt(x);
this.lastClickAt = 0;
return;
}
this.lastClickAt = now;
this.lastClickX = x;
this.selectedId = null;
this.emptyDown = true;
this.mode = "pan";
this.grabT = this.xToTime(x);
this.grabX = x;
this.lastX = x;
this.lastT = performance.now();
this.dragSign = 0;
this.pushVel(x);
this.emit();
};
onMove = (e: PointerEvent) => {
const { x, y } = this.localXY(e);
this.cursorX = x;
this.cursorY = y;
if (this.ptrs.get(e.pointerId)) this.ptrs.set(e.pointerId, {
id: e.pointerId,
x,
y
});
if (this.mode === "pinch" && this.ptrs.size >= 2) {
this.sunHover = false;
const [a, b] = [...this.ptrs.values()];
const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
const mid = (a.x + b.x) / 2;
this.spanMs = clamp(this.pinchSpan0 * Math.pow(this.pinchDist0 / dist, 2.25), MIN_SPAN_MS, MAX_SPAN_MS);
this.targetSpan = this.spanMs;
this.pinchX = mid;
this.dirtyWarp = true;
this.rebuildWarp();
this.setAnchor(this.pinchT, mid);
this.noteGesture(mid);
return;
}
if (this.mode === "pan") {
if (e.buttons === 0) return;
this.sunHover = false;
if (Math.abs(x - this.grabX) > 3) this.moved = true;
this.setAnchor(this.grabT, x);
this.noteGesture(x);
this.pushVel(x);
const dx = x - this.grabX;
if (Math.abs(dx) > 8) this.dragSign = Math.sign(dx);
this.lastX = x;
this.lastT = performance.now();
this.canvas.style.cursor = "grabbing";
return;
}
if (this.mode === "drag-event" && this.dragId) {
if (Math.abs(x - this.lastX) > 2 && !this.moved) {
this.undo.push(JSON.stringify(this.dragOrigin));
if (this.undo.length > 40) this.undo.shift();
this.redo.length = 0;
this.moved = true;
}
if (Math.abs(x - this.lastX) > 2) this.moved = true;
const origin = this.dragOrigin.find((ev: CalEvent) => ev.id === this.dragId);
if (!origin) return;
const delta = this.softSnap(this.xToTime(x) - this.grabT) - origin.start;
const ids = new Set([this.dragId, ...this.descendants(this.dragId).map((c: CalEvent) => c.id)]);
this.events = this.dragOrigin.map((ev: CalEvent) => ids.has(ev.id) ? {
...ev,
start: ev.start + delta,
end: ev.end + delta
} : ev);
this.dirtyWarp = true;
this.lastX = x;
this.canvas.style.cursor = "grabbing";
return;
}
if ((this.mode === "resize-start" || this.mode === "resize-end") && this.dragId) {
if (!this.dragOrigin.find((ev: CalEvent) => ev.id === this.dragId)) return;
if (Math.abs(x - this.lastX) > 2 && !this.moved) {
this.undo.push(JSON.stringify(this.dragOrigin));
if (this.undo.length > 40) this.undo.shift();
this.redo.length = 0;
this.moved = true;
}
if (Math.abs(x - this.lastX) > 2) this.moved = true;
const t = this.softSnap(this.xToTime(x));
this.events = this.dragOrigin.map((ev: CalEvent) => {
if (ev.id !== this.dragId) return ev;
if (this.mode === "resize-start") return {
...ev,
start: Math.min(t, ev.end - MIN_EVENT_MS)
};
return {
...ev,
end: Math.max(t, ev.start + MIN_EVENT_MS)
};
});
this.dirtyWarp = true;
this.lastX = x;
this.canvas.style.cursor = "ew-resize";
return;
}
this.cursorT = this.xToTime(x);
const hit = this.hitTest(x, y);
this.hoverId = hit.chip?.event.id ?? null;
this.hoverHandle = hit.handle;
this.sunHover = false;
if (!hit.chip && !hit.minimap && !hit.handle) {
const sun = this.hitSun(x, y);
if (sun) {
this.sunHover = true;
this.hoverSun = sun;
}
}
this.canvas.style.cursor = hit.minimap ? "pointer" : hit.handle ? "ew-resize" : hit.chip ? "grab" : this.sunHover || this.sunHoverA > .2 ? "pointer" : "grab";
};
onUp = (e: PointerEvent) => {
const { x, y } = this.localXY(e);
this.cursorX = x;
this.cursorY = y;
this.ptrs.delete(e.pointerId);
if (this.mode === "pinch") {
if (this.ptrs.size < 2) this.mode = "none";
return;
}
if (this.mode === "pan") {
const stableX = this.stablePanX();
const releaseX = stableX ?? x;
if (!this.moved && this.emptyDown && this.source !== "demo") {
this.callbacks.onEmptyClick?.(this.xToTime(x));
this.noteIntent("empty-click");
} else if (this.moved && stableX != null) this.setAnchor(this.grabT, stableX);
if (this.moved && !this.reducedMotion) {
let v = this.releaseVel();
if (this.dragSign !== 0 && Math.sign(v) !== 0 && Math.sign(v) !== this.dragSign) v = 0;
if (Math.abs(v) < 160) v = 0;
this.flickT = this.grabT;
this.flickX = releaseX;
this.flickV = clamp(v, -9e3, 9e3);
this.coastPx = 0;
} else {
this.flickT = null;
this.flickV = 0;
this.coastPx = 0;
}
}
if ((this.mode === "drag-event" || this.mode === "resize-start" || this.mode === "resize-end") && this.dragId) {
if (this.moved) {
this.commitSnap(this.dragId);
this.persist();
this.emitRetime(this.dragId);
} else if (this.mode === "drag-event" && this.dragOrigin.length) {
this.events = this.dragOrigin;
const ev = this.events.find((e) => e.id === this.dragId);
if (ev?.mark) {
this.callbacks.onActivate?.(ev.mark.entityId, ev.mark);
this.noteIntent(`activate ${ev.title}`);
}
}
}
this.mode = "none";
this.dragId = null;
this.snapGuide = null;
this.velBuf = [];
const pending = this.pendingData;
this.pendingData = null;
if (pending) this.loadData(pending);
this.emit();
};
onLeave = () => {
if (this.mode === "none") {
this.hoverId = null;
this.cursorT = null;
this.sunHover = false;
this.canvas.style.cursor = "grab";
}
};
onWheel = (e: WheelEvent) => {
e.preventDefault();
this.springing = false;
this.sunHover = false;
const { x, y } = this.localXY(e);
this.cursorX = x;
this.cursorY = y;
this.wheelX = x;
this.noteGesture(x);
const notches = wheelNotches(e);
if (e.ctrlKey || e.metaKey) {
let log: number;
if (notches != null) log = notches * Math.log(1.055);
else {
const pixel = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1;
log = e.deltaY * pixel * .009;
}
log = clamp(log, -Math.log(1.1), Math.log(1.1));
this.slideZoomLog += log;
this.flickT = null;
this.flickV = 0;
this.zoomCoast = 0;
return;
}
const pixel = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1;
const dxPx = e.deltaX * pixel;
const dyPx = e.deltaY * pixel;
let raw: number;
if (e.shiftKey) raw = dyPx;
else if (Math.abs(dxPx) > Math.abs(dyPx) * .45) raw = dxPx;
else raw = dxPx + dyPx;
let dx: number;
if (notches != null) {
const n = Math.sign(raw) * Math.abs(notches);
dx = n * Math.max(18, this.width * .016);
} else {
dx = raw * 2.35;
}
const cap = this.width * .05;
this.slidePx += clamp(dx, -cap, cap);
this.flickT = null;
this.flickV = 0;
this.coastPx = 0;
this.lastT = performance.now();
};
onMenu = (e: MouseEvent) => {
e.preventDefault();
const { x, y } = this.localXY(e);
const hit = this.hitTest(x, y);
const ev = hit.chip?.event;
if (ev?.mark?.track === "planned" && ev.mark.occRef !== undefined) {
this.callbacks.onOccurrenceMenu?.(ev.mark.entityId, ev.mark.occRef, e.clientX, e.clientY);
this.noteIntent(`occurrence-menu ${ev.title}`);
return;
}
if (ev?.mark?.track === "recorded" && ev.mark.sessionAnchorId != null) {
this.callbacks.onSessionMenu?.(ev.mark.entityId, ev.mark.sessionAnchorId, e.clientX, e.clientY);
this.noteIntent(`session-menu ${ev.title}`);
return;
}
this.callbacks.onBandMenu?.(e.clientX, e.clientY);
this.noteIntent("band-menu");
};
onKey = (e: KeyboardEvent) => {
const tag = (e.target as HTMLElement | null)?.tagName;
if (tag === "INPUT" || tag === "TEXTAREA") return;
if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
e.preventDefault();
if (e.shiftKey) this.redoLast();
else this.undoLast();
return;
}
if (e.key === "Home" || e.key.toLowerCase() === "n") {
e.preventDefault();
this.goToNow();
} else if (e.key === "+" || e.key === "=") this.zoomAt(this.width / 2, .62);
else if (e.key === "-" || e.key === "_") this.zoomAt(this.width / 2, 1.61);
else if (e.key === "ArrowLeft") this.setAnchor(this.xToTime(this.width / 2), this.width / 2 + this.width * .08);
else if (e.key === "ArrowRight") this.setAnchor(this.xToTime(this.width / 2), this.width / 2 - this.width * .08);
else if (e.key === "Delete" || e.key === "Backspace") this.deleteSelected();
else if (e.key === "Escape") {
this.selectedId = null;
this.emit();
}
};
snap(t: number) {
let best = snapTime(t, this.spanMs);
let bestPx = 8;
for (const ev of this.events) {
if (ev.id === this.dragId) continue;
for (const edge of [ev.start, ev.end]) {
const px = Math.abs(this.mapX(edge, this.centerT, this.spanMs) - this.mapX(t, this.centerT, this.spanMs));
if (px < bestPx) {
bestPx = px;
best = edge;
}
}
}
return best;
}
softSnap(t: number) {
const s = this.snap(t);
const px = Math.abs(this.mapX(s, this.centerT, this.spanMs) - this.mapX(t, this.centerT, this.spanMs));
this.snapGuide = px < 8 ? s : null;
return t;
}
commitSnap(id: string) {
const ev = this.events.find((e: CalEvent) => e.id === id);
if (!ev || ev.point) return;
if (this.mode === "resize-start" || this.mode === "resize-end") {
const start = snapTime(ev.start, this.spanMs);
const end = snapTime(ev.end, this.spanMs);
this.events = this.events.map((e: CalEvent) => e.id === id ? {
...e,
start,
end: Math.max(end, start + MIN_EVENT_MS)
} : e);
return;
}
const delta = snapTime(ev.start, this.spanMs) - ev.start;
if (Math.abs(delta) < 1) return;
this.applyDelta(id, delta);
}
createAt(x: number) {
const t = this.snap(this.xToTime(x));
if (this.source !== "demo") {
this.callbacks.onEmptyClick?.(t);
this.noteIntent(`empty-click ${formatRange(t, t + HOUR)}`);
return;
}
const start = t;
const event = {
id: `new_${Date.now().toString(36)}`,
title: "New block",
start,
end: start + HOUR,
kind: "event" as EventKind,
category: "focus" as EventCategory
};
this.pushUndo();
this.events = [...this.events, event];
this.selectedId = event.id;
this.persist();
this.dirtyWarp = true;
this.emit();
}
emitRetime(id: string) {
const ev = this.events.find((e) => e.id === id);
if (!ev?.mark) return;
const start = ev.start;
const end = ev.end;
if (ev.mark.track === "recorded" && ev.mark.sessionAnchorId != null) {
this.callbacks.onSessionRetime?.(ev.mark.entityId, ev.mark.sessionAnchorId, start, end);
this.noteIntent(`session-retime ${ev.title}`);
return;
}
if (ev.mark.occRef !== undefined) {
this.callbacks.onOccurrenceRetime?.(ev.mark.entityId, ev.mark.occRef, start, end);
this.noteIntent(`occurrence-retime ${ev.title}`);
}
}
jumpMinimap(x: number) {
const { min, max } = this.bounds();
const t = min + x / Math.max(this.width, 1) * (max - min);
this.noteGesture(x);
this.springTo(t, this.spanMs);
}
emit() {
const s = this.snapshot();
const minute = Math.floor(s.now / 6e4);
const spanBucket = Math.round(Math.log2(s.spanMs) * 24);
const key = `${s.selectedId}|${s.warp}|${Number(s.nowLens)}|${s.eventCount}|${minute}|${spanBucket}|${s.selected?.title ?? ""}|${s.selected?.start ?? 0}|${s.selected?.end ?? 0}|${s.lastIntent ?? ""}`;
if (key === this.lastEmitKey) return;
this.lastEmitKey = key;
this.host.onChange(s);
}

}
