export type GlyphPrimitive =
  | { op: "polygon"; points: string; closed?: boolean }
  | { op: "circle"; cx: number; cy: number; r: number; solid?: boolean }
  | { op: "segments"; d: string; closed: boolean }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; dash?: number[] };

export type GlyphSpec = { fillable: boolean; primitives: GlyphPrimitive[] };

export const GLYPH_BOX = 24;
export const STROKE = { base: 1.6, filled: 1.2, scheduled: 1.35, scheduledSpace: 1.2 };
export const SPIN = { fullTurnMs: 8000 };
export const SPIN_ORIGIN: Record<string, [number, number]> = {
  task: [12, 12], moment: [12, 12], space: [12, 12], community: [12, 12],
  resource: [12, 12], individual: [12, 12], place: [12, 12],
};
export const SCHEDULED_DAMP = { about: [12, 12] as [number, number], scale: 0.88 };
export const DONE_CHECK = "M6,13 L10,17 L18,8";
export const CANCEL_BAR = { x1: 5, y1: 5, x2: 19, y2: 19, casingWidth: 3.2, barWidth: 1.4 };
export const TASK_REQUESTED = "8,6 16,6 16,18 8,18";
const diamond: GlyphPrimitive[] = [{ op: "polygon", points: "12,4 20,12 12,20 4,12", closed: true }];
const circle: GlyphPrimitive[] = [{ op: "circle", cx: 12, cy: 12, r: 7 }];
export const GLYPH_GEOMETRY: Record<string, GlyphSpec> = {
  task: { fillable: true, primitives: diamond },
  moment: { fillable: true, primitives: circle },
  space: { fillable: true, primitives: [
    { op: "circle", cx: 12, cy: 12, r: 8 },
    { op: "circle", cx: 12, cy: 12, r: 5 },
    { op: "circle", cx: 12, cy: 12, r: 2.5, solid: true },
  ]},
  community: { fillable: true, primitives: circle },
  resource: { fillable: true, primitives: diamond },
  individual: { fillable: true, primitives: circle },
  place: { fillable: true, primitives: diamond },
};
