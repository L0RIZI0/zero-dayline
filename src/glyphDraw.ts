import {
  CANCEL_BAR,
  DONE_CHECK,
  GLYPH_BOX,
  GLYPH_GEOMETRY,
  SCHEDULED_DAMP,
  SPIN,
  SPIN_ORIGIN,
  STROKE,
  TASK_REQUESTED,
  type GlyphPrimitive,
} from "./glyphs";

export type GlyphDrawFlags = {
  kind: string;
  accent: string;
  bg: string;
  size: number;
  cx: number;
  cy: number;
  ongoing?: boolean;
  flip180?: boolean;
  done?: boolean;
  cancelled?: boolean;
  filled?: boolean;
  scheduled?: boolean;
  requested?: boolean;
  timeMs?: number;
  reducedMotion?: boolean;
  /** performance.now() when a spin-once started; ignored if ongoing. */
  spinOnceAt?: number;
  /** performance.now() when a flash-fill started. */
  flashAt?: number;
  /** flash duration; default SPIN.flashMs, SPIN.fullTurnMs when paired with spin-once. */
  flashDur?: number;
  /** performance.now() when ongoing became true. */
  ongoingSince?: number;
  /** angle (rad) at the moment ongoing went false. */
  landingFrom?: number;
  /** performance.now() when landing started. */
  landingAt?: number;
};

function parsePoints(s: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const re = /(-?[\d.]+)\s*,\s*(-?[\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push({ x: +m[1], y: +m[2] });
  return out;
}

function parsePath(d: string): { op: "M" | "L"; x: number; y: number }[] {
  const out: { op: "M" | "L"; x: number; y: number }[] = [];
  const re = /([ML])\s*(-?[\d.]+)\s*,?\s*(-?[\d.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    out.push({ op: m[1].toUpperCase() as "M" | "L", x: +m[2], y: +m[3] });
  }
  return out;
}

function polygon(ctx: CanvasRenderingContext2D, points: string) {
  const pts = parsePoints(points);
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function segments(ctx: CanvasRenderingContext2D, d: string, closed: boolean) {
  const cmds = parsePath(d);
  if (!cmds.length) return;
  ctx.beginPath();
  for (const c of cmds) {
    if (c.op === "M") ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  }
  if (closed) ctx.closePath();
}

function primitive(
  ctx: CanvasRenderingContext2D,
  p: GlyphPrimitive,
  accent: string,
  strokeW: number,
  fillable: boolean,
  filled: boolean,
) {
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = strokeW;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (p.op === "polygon") {
    polygon(ctx, p.points);
    if (filled && fillable) ctx.fill();
    else ctx.stroke();
  } else if (p.op === "circle") {
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
    if (p.solid || (filled && fillable)) ctx.fill();
    else ctx.stroke();
  } else if (p.op === "segments") {
    segments(ctx, p.d, p.closed);
    if (filled && fillable && p.closed) ctx.fill();
    else ctx.stroke();
  } else if (p.op === "line") {
    if (p.dash) ctx.setLineDash(p.dash);
    ctx.beginPath();
    ctx.moveTo(p.x1, p.y1);
    ctx.lineTo(p.x2, p.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function paintPrims(
  ctx: CanvasRenderingContext2D,
  kind: string,
  prims: GlyphPrimitive[],
  accent: string,
  strokeW: number,
  fillable: boolean,
  filled: boolean,
) {
  for (let i = 0; i < prims.length; i++) {
    ctx.save();
    if (kind === "space" && i === 1 && !filled) ctx.globalAlpha *= 0.5;
    if (kind === "space" && i === 2 && !filled) ctx.globalAlpha *= 0.42;
    if (kind === "space" && i > 0 && filled) {
      ctx.restore();
      continue;
    }
    primitive(ctx, prims[i], accent, strokeW, fillable, filled);
    ctx.restore();
  }
}

/** CSS cubic-bezier(x1,y1,x2,y2) evaluated at time x in [0,1]. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const u = 1 - t;
    const xt = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t;
    const dxt = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(dxt) < 1e-6) break;
    t -= (xt - x) / dxt;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const u = 1 - t;
  return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
}

const spinOnceEase = (p: number) => cubicBezier(0.22, 1, 0.36, 1, p);
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;

/** Ongoing spin angle (rad). Ease-in over SPIN.easeMs, linear after. */
export function ongoingAngle(elapsedMs: number): number {
  const omega = (Math.PI * 2) / SPIN.fullTurnMs;
  const ease = SPIN.easeMs;
  if (elapsedMs <= 0) return 0;
  if (elapsedMs < ease) {
    const u = elapsedMs / ease;
    // ∫ easeOutCubic = ∫ (3u-3u²+u³) du → 1.5u² - u³ + 0.25u⁴, scaled by easeMs
    return omega * ease * (1.5 * u * u - u ** 3 + 0.25 * u ** 4);
  }
  const atEase = omega * ease * 0.75;
  return atEase + omega * (elapsedMs - ease);
}

export function glyphStillAnimating(g: GlyphDrawFlags, now: number): boolean {
  if (g.reducedMotion) return false;
  if (g.ongoing) return true;
  if (g.spinOnceAt != null && now - g.spinOnceAt < SPIN.fullTurnMs) return true;
  const flashDur = g.flashDur ?? SPIN.flashMs;
  if (g.flashAt != null && now - g.flashAt < flashDur) return true;
  if (g.landingAt != null && now - g.landingAt < SPIN.easeMs) return true;
  return false;
}

function spinFor(g: GlyphDrawFlags, now: number): number {
  if (g.reducedMotion) return 0;
  if (g.ongoing && g.ongoingSince != null) return ongoingAngle(now - g.ongoingSince);
  if (g.ongoing) {
    const t = now % SPIN.fullTurnMs;
    return (t / SPIN.fullTurnMs) * Math.PI * 2;
  }
  if (g.landingAt != null) {
    const p = Math.min(1, Math.max(0, (now - g.landingAt) / SPIN.easeMs));
    const from = g.landingFrom ?? 0;
    const twoPi = Math.PI * 2;
    const target = Math.ceil(from / twoPi - 1e-6) * twoPi;
    const dest = target <= from + 1e-6 ? from + twoPi : target;
    return from + (dest - from) * spinOnceEase(p);
  }
  if (g.spinOnceAt != null) {
    const p = (now - g.spinOnceAt) / SPIN.fullTurnMs;
    if (p <= 0) return 0;
    if (p >= 1) return 0;
    return spinOnceEase(p) * Math.PI * 2;
  }
  return 0;
}

function flashAlpha(g: GlyphDrawFlags, now: number): number {
  if (g.reducedMotion || g.flashAt == null) return 0;
  const dur = g.flashDur ?? SPIN.flashMs;
  const p = (now - g.flashAt) / dur;
  if (p <= 0 || p >= 1) return 0;
  const u = p < 0.5 ? p * 2 : (1 - p) * 2;
  return u * u * (3 - 2 * u);
}

export function drawGlyph(ctx: CanvasRenderingContext2D, g: GlyphDrawFlags) {
  const kind = g.kind in GLYPH_GEOMETRY ? g.kind : "task";
  const spec = GLYPH_GEOMETRY[kind];
  const filled = !!(g.filled && spec.fillable);
  const scheduled = !!(g.scheduled && !filled);
  let strokeW: number = STROKE.base;
  if (filled) strokeW = STROKE.filled;
  else if (scheduled) strokeW = kind === "space" ? STROKE.scheduledSpace : STROKE.scheduled;

  const now = g.timeMs ?? 0;
  const origin = SPIN_ORIGIN[kind] ?? [12, 12];
  const spin = spinFor(g, now);
  const flash = flashAlpha(g, now);

  ctx.save();
  ctx.translate(g.cx, g.cy);
  ctx.scale(g.size / GLYPH_BOX, g.size / GLYPH_BOX);
  ctx.translate(-12, -12);
  ctx.translate(origin[0], origin[1]);
  ctx.rotate(spin);
  ctx.translate(-origin[0], -origin[1]);
  if (g.flip180) {
    ctx.translate(12, 12);
    ctx.rotate(Math.PI);
    ctx.translate(-12, -12);
  }
  if (scheduled && (kind === "space" || kind === "community" || kind === "resource")) {
    ctx.translate(SCHEDULED_DAMP.about[0], SCHEDULED_DAMP.about[1]);
    ctx.scale(SCHEDULED_DAMP.scale, SCHEDULED_DAMP.scale);
    ctx.translate(-SCHEDULED_DAMP.about[0], -SCHEDULED_DAMP.about[1]);
  }
  if (kind === "individual") {
    ctx.translate(12, 12);
    ctx.rotate(-Math.PI / 4);
    ctx.translate(-12, -12);
  }

  const prims: GlyphPrimitive[] =
    kind === "task" && g.requested
      ? [{ op: "polygon", points: TASK_REQUESTED, closed: true }]
      : spec.primitives;

  paintPrims(ctx, kind, prims, g.accent, strokeW || STROKE.base, spec.fillable, filled);

  if (flash > 0.01 && spec.fillable && !filled) {
    ctx.save();
    ctx.globalAlpha *= flash;
    paintPrims(ctx, kind, prims, g.accent, STROKE.filled, spec.fillable, true);
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(g.cx, g.cy);
  ctx.scale(g.size / GLYPH_BOX, g.size / GLYPH_BOX);
  ctx.translate(-12, -12);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (g.done) {
    ctx.strokeStyle = filled ? g.bg : g.accent;
    ctx.lineWidth = 1.8;
    segments(ctx, DONE_CHECK, false);
    ctx.stroke();
  }
  if (g.cancelled) {
    ctx.strokeStyle = g.bg;
    ctx.lineWidth = CANCEL_BAR.casingWidth;
    ctx.beginPath();
    ctx.moveTo(CANCEL_BAR.x1, CANCEL_BAR.y1);
    ctx.lineTo(CANCEL_BAR.x2, CANCEL_BAR.y2);
    ctx.stroke();
    ctx.strokeStyle = g.accent;
    ctx.lineWidth = CANCEL_BAR.barWidth;
    ctx.beginPath();
    ctx.moveTo(CANCEL_BAR.x1, CANCEL_BAR.y1);
    ctx.lineTo(CANCEL_BAR.x2, CANCEL_BAR.y2);
    ctx.stroke();
  }
  ctx.restore();
}
