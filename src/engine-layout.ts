import { EngineView } from "./engine-view";
import type { CalEvent, PlacedChip } from "./types";
import type { Hit } from "./engine-core";

export class EngineLayout extends EngineView {
layout() {
const tL = this.tLeft();
const tR = this.tRight();
const pad = this.spanMs * .06;
const vis = this.events.filter((e: CalEvent) => e.end >= tL - pad && e.start <= tR + pad);
const byId = new Map(this.events.map((e) => [e.id, e]));
const depthOf = (e: CalEvent) => {
let d = 0;
let cur = e;
let g = 0;
while (cur.parentId && g++ < 6) {
const p = byId.get(cur.parentId);
if (!p) break;
cur = p;
d += 1;
}
return d;
};
const ly = this.lineY();
const out: PlacedChip[] = [];
const events = vis.filter((e: CalEvent) => e.kind === "event");
const bands = vis.filter((e: CalEvent) => e.kind === "band");
const stones = vis.filter((e: CalEvent) => e.kind === "milestone");
for (const e of bands) {
const x0 = this.timeToX(e.start);
const x1 = this.timeToX(e.end);
const depth = depthOf(e);
const h = 13 + depth * 3;
out.push({
event: e,
x0,
x1,
y: ly - h / 2,
h,
lane: 0,
depth,
clustered: false,
clusterCount: 1
});
}
const fine: CalEvent[] = [];
const clusterBuckets = new Map();
for (const e of events) {
const x0 = this.timeToX(e.start);
const x1 = this.timeToX(e.end);
if (x1 - x0 < 5.5) {
const b = Math.round((x0 + x1) * .5 / 9);
const arr = clusterBuckets.get(b) ?? [];
arr.push(e);
clusterBuckets.set(b, arr);
} else fine.push(e);
}
for (const [, group] of clusterBuckets) {
if (group.length === 1 && this.timeToX(group[0].end) - this.timeToX(group[0].start) > 3) {
fine.push(group[0]);
continue;
}
const mid = group.reduce((s: number, e: CalEvent) => s + (e.start + e.end) / 2, 0) / group.length;
const x = this.timeToX(mid);
out.push({
event: group[0],
x0: x - 2,
x1: x + 2,
y: ly - 16,
h: 16,
lane: 0,
depth: 0,
clustered: true,
clusterCount: group.length
});
}
fine.sort((a, b) => a.start - b.start || b.end - a.end);
const spanOf = (e: CalEvent) => {
let s = e.start;
let en = e.end;
for (const c of fine) {
if (c.parentId === e.id) {
s = Math.min(s, c.start);
en = Math.max(en, c.end);
}
}
return { start: s, end: en };
};
const lanes: { start: number; end: number }[][] = [];
const parentVisible = (e: CalEvent) => !!(e.parentId && vis.some((p) => p.id === e.parentId));
for (const e of fine) {
const depth = depthOf(e);
let lane = 0;
if (!parentVisible(e)) {
const span = spanOf(e);
while (true) {
const row = lanes[lane] ?? (lanes[lane] = []);
if (!row.some((r) => r.start < span.end && span.start < r.end)) {
row.push(span);
break;
}
lane += 1;
if (lane > 7) break;
}
}
const x0 = this.timeToX(e.start);
const x1 = this.timeToX(e.end);
const h = e.mark?.kind === "space" ? 26 : 22;
const recorded = e.track === "recorded";
const access = e.track === "access";
const y = access ? ly + 4 : recorded ? ly + 16 + lane * 26 : ly - 28 - lane * 26;
out.push({
event: e,
x0,
x1,
y: access ? ly + 4 : y,
h: access ? 8 : h,
lane,
depth,
clustered: false,
clusterCount: 1
});
}
const chips = out.filter((p) => p.event.kind === "event" && !p.clustered && !parentVisible(p.event));
chips.sort((a, b) => a.x0 - b.x0 || a.event.start - b.event.start);
for (let i = 0; i < chips.length; i++) {
const p = chips[i];
let guard = 0;
while (guard++ < 8) {
if (!chips.slice(0, i).some((o) => p.x0 < o.x1 - 6 && o.x0 < p.x1 - 6 && Math.abs(o.y - p.y) < p.h - 2)) break;
p.lane += 1;
if (p.event.track === "recorded") p.y = ly + 16 + p.lane * 26;
else p.y = ly - 28 - p.lane * 26;
}
}
for (const e of stones) {
const x = this.timeToX(e.start);
out.push({
event: e,
x0: x - 5,
x1: x + 5,
y: ly - 5,
h: 10,
lane: 0,
depth: 0,
clustered: false,
clusterCount: 1
});
}
for (const p of out) {
if (!p.event.parentId || p.clustered) continue;
const parent = out.find((o) => o.event.id === p.event.parentId && !o.clustered);
if (!parent) continue;
p.y = parent.y + 4;
p.h = Math.max(16, parent.h - 8);
p.lane = parent.lane;
}
return out;
}
hitTest(x: number, y: number): Hit {
if (y > this.height - 44) return {
chip: null,
handle: null,
minimap: true
};
if (this.selectedId) {
const sel = this.placed.find((p: PlacedChip) => p.event.id === this.selectedId && !p.clustered);
if (sel && sel.x1 - sel.x0 > 28) {
if (x >= sel.x0 - 3 && x <= sel.x0 + 9 && y >= sel.y - 4 && y <= sel.y + sel.h + 4) return {
chip: sel,
handle: "start",
minimap: false
};
if (x >= sel.x1 - 9 && x <= sel.x1 + 3 && y >= sel.y - 4 && y <= sel.y + sel.h + 4) return {
chip: sel,
handle: "end",
minimap: false
};
}
}
for (let i = this.placed.length - 1; i >= 0; i--) {
const p = this.placed[i];
if (p.clustered) continue;
if (p.event.kind === "milestone") {
const cx = (p.x0 + p.x1) / 2;
if (Math.hypot(x - cx, y - this.lineY()) < 9) return {
chip: p,
handle: null,
minimap: false
};
continue;
}
if (x >= p.x0 - 1 && x <= p.x1 + 1 && y >= p.y - 2 && y <= p.y + p.h + 2) return {
chip: p,
handle: null,
minimap: false
};
}
return {
chip: null,
handle: null,
minimap: false
};
}
descendants(id: string): CalEvent[] {
const out: CalEvent[] = [];
const walk = (pid: string) => {
for (const e of this.events) if (e.parentId === pid) {
out.push(e);
walk(e.id);
}
};
walk(id);
return out;
}
pushUndo() {
this.undo.push(JSON.stringify(this.events));
if (this.undo.length > 40) this.undo.shift();
this.redo.length = 0;
}
applyDelta(id: string, delta: number) {
const ids = new Set([id, ...this.descendants(id).map((e: CalEvent) => e.id)]);
this.events = this.events.map((e: CalEvent) => ids.has(e.id) ? {
...e,
start: e.start + delta,
end: e.end + delta
} : e);
}
pushVel(x: number) {
const t = performance.now();
this.velBuf.push({
t,
x
});
while (this.velBuf.length > 0 && t - this.velBuf[0].t > 100) this.velBuf.shift();
}
releaseVel() {
const now = performance.now();
const samples = this.velBuf.filter((s) => now - s.t > 28 && now - s.t < 120);
if (samples.length < 2) return 0;
const a = samples[0];
const b = samples[samples.length - 1];
const dt = (b.t - a.t) / 1e3;
if (dt < .016) return 0;
return (b.x - a.x) / dt;
}
stablePanX() {
const now = performance.now();
const samples = this.velBuf.filter((s) => now - s.t > 20);
if (!samples.length) return null;
return samples[samples.length - 1].x;
}
localXY(e: PointerEvent | WheelEvent | MouseEvent) {
const r = this.canvas.getBoundingClientRect();
return {
x: e.clientX - r.left,
y: e.clientY - r.top
};
}

}
