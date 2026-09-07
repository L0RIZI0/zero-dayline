/** Pixel-faithful 24×24 glyph spec, from Zero `packages/dayline-contract/glyphs.ts`. */

export type GlyphPrimitive =
  | { op: "polygon"; points: string; closed?: boolean }
  | { op: "circle"; cx: number; cy: number; r: number; solid?: boolean }
  | { op: "segments"; d: string; closed: boolean }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; dash?: number[] };

export type GlyphSpec = { fillable: boolean; primitives: GlyphPrimitive[] };

export const GLYPH_BOX = 24;
export const GLYPH_CX = 12;
export const GLYPH_CY = 12;

export const HEXAGON = "12,1.6 21.01,6.8 21.01,17.2 12,22.4 2.99,17.2 2.99,6.8";
export const PENTAGON = "12,1.62 21.87,8.79 18.10,20.40 5.90,20.40 2.13,8.79";
export const DIAMOND = "12,1.62 22.38,12 12,22.38 1.62,12";
export const TRIANGLE_UP = "12,4 20,19 4,19";
export const TRIANGLE_DOWN = "12,20 20,5 4,5";
export const SQUARE = "4.5,4.5 19.5,4.5 19.5,19.5 4.5,19.5";
export const TASK_REQUESTED = "4.5,4.5 19.5,4.5 19.5,19.5 10.8,22.4 14,19.5 4.5,19.5";

export const GLYPH_GEOMETRY: Record<string, GlyphSpec> = {
  task: { fillable: true, primitives: [{ op: "polygon", points: SQUARE, closed: true }] },
  space: {
    fillable: true,
    primitives: [
      { op: "polygon", points: HEXAGON, closed: true },
      { op: "segments", d: "M12,12 L12,1.6 M12,12 L2.99,17.2 M12,12 L21.01,17.2", closed: false },
      { op: "circle", cx: 12, cy: 12, r: 1.8, solid: true },
    ],
  },
  resource: { fillable: true, primitives: [{ op: "polygon", points: DIAMOND, closed: true }] },
  moment: { fillable: true, primitives: [{ op: "polygon", points: TRIANGLE_UP, closed: true }] },
  instant: { fillable: true, primitives: [{ op: "polygon", points: TRIANGLE_DOWN, closed: true }] },
  community: { fillable: true, primitives: [{ op: "polygon", points: PENTAGON, closed: true }] },
  organism: { fillable: false, primitives: [{ op: "circle", cx: 12, cy: 12, r: 9.8 }] },
  entity: {
    fillable: false,
    primitives: [{ op: "segments", d: "M12 3 L12 9 M12 15 L12 21 M3 12 L9 12 M15 12 L21 12", closed: false }],
  },
  individual: {
    fillable: false,
    primitives: [{ op: "segments", d: "M6 6.5 L18 6.5 L6 17.5 L18 17.5", closed: false }],
  },
  soul: { fillable: false, primitives: [{ op: "circle", cx: 12, cy: 12, r: 3.5, solid: true }] },
  link: {
    fillable: false,
    primitives: [
      { op: "circle", cx: 6, cy: 18, r: 2.6 },
      { op: "circle", cx: 18, cy: 6, r: 2.6 },
      { op: "line", x1: 7.84, y1: 16.16, x2: 16.16, y2: 7.84, dash: [2.4, 2] },
    ],
  },
  place: { fillable: true, primitives: [{ op: "polygon", points: DIAMOND, closed: true }] },
};

export const STROKE = {
  base: 1.6,
  scheduled: 2.9,
  scheduledSpace: 3.1,
  filled: 0,
} as const;

export const SCHEDULED_DAMP = { translate: 0.313, scale: 0.9739, about: [12, 12] as [number, number] };

export const DONE_CHECK = "M7.5 12.5 L10.5 15.5 L16.5 8.5";

export const CANCEL_BAR = {
  x1: 3,
  y1: 12,
  x2: 21,
  y2: 12,
  casingWidth: 3.4,
  barWidth: 1.8,
};

export const SPIN = {
  fullTurnMs: 2345,
  easeMs: 650,
  flashMs: 720,
  morphMs: 380,
} as const;

export const SPIN_ORIGIN: Record<string, [number, number]> = {
  moment: [12, 14],
  instant: [12, 10],
};
