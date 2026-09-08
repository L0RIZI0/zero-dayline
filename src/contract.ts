export type DaylineKind =
  | "task"
  | "moment"
  | "instant"
  | "space"
  | "community"
  | "resource"
  | "individual"
  | "place"
  | "organism"
  | "entity"
  | "soul"
  | "link";

export type DaylineTrack = "planned" | "recorded" | "access";

export type DaylineGlyph = {
  kind: string;
  accent: string;
  ongoing?: boolean;
  cancelled?: boolean;
  done?: boolean;
  filled?: boolean;
  scheduled?: boolean;
  requested?: boolean;
  flip180?: boolean;
  /** Monotonic; engine plays spin-once when this increases. */
  spinOnce?: number;
  /** Monotonic; engine plays flash-fill when this increases. */
  flashFill?: number;
};

export type DaylineOccRef = {
  id: string;
  day?: number;
  [key: string]: unknown;
};

export type DaylineMark = {
  key: string;
  entityId: string;
  kind: DaylineKind;
  track: DaylineTrack;
  title: string;
  end: number;
  start?: number;
  glyph: DaylineGlyph;
  parentId?: string | null;
  point?: boolean;
  instant?: boolean;
  ongoing?: boolean;
  openEnded?: boolean;
  unknownEnd?: boolean;
  unknownStart?: boolean;
  cancelled?: boolean;
  auto?: boolean;
  occRef?: DaylineOccRef;
  sessionAnchorId?: string | number;
};

export type DaylineData = {
  now: number;
  marks: DaylineMark[];
  rails?: { planned?: boolean; recorded?: boolean; access?: boolean };
  /** Sky curves. Defaults: sun on, moon off. */
  sky?: { sun?: boolean; moon?: boolean };
};

export type DaylineTheme = {
  scheme?: "light" | "dark";
  background?: string;
  foreground?: string;
  muted?: string;
  border?: string;
  now?: string;
};

export type DaylineCallbacks = {
  onEmptyClick?: (t: number) => void;
  onActivate?: (entityId: string, mark: DaylineMark) => void;
  onOccurrenceMenu?: (entityId: string, occRef: DaylineOccRef | undefined, x: number, y: number) => void;
  onSessionMenu?: (entityId: string, sessionAnchorId: string | number | undefined, x: number, y: number) => void;
  onBandMenu?: (x: number, y: number) => void;
  onOccurrenceRetime?: (entityId: string, occRef: DaylineOccRef | undefined, start: number, end: number) => void;
  onSessionRetime?: (entityId: string, sessionAnchorId: string | number | undefined, start: number, end: number) => void;
};

export type DaylineMountOptions = {
  clock?: "wall" | "data";
  nowRestFraction?: number;
  dpr?: number;
  /**
   * Extra canvas pixels below the band. Layout (axis, ticks, marks, now
   * marker, hit-testing) uses `height - skyBleedPx`. Only sun/moon strokes
   * draw into the bleed; that region stays transparent. Default 0.
   * Mount-time only (needs an alpha canvas). Zero sizes the <canvas> to
   * bandHeight + skyBleedPx and overlays the bleed with pointer-events-none.
   */
  skyBleedPx?: number;
  /**
   * `"demo"` skips host data, loads `seedCalendar`, and persists to localStorage.
   * Zero must leave this unset (host data + persist off).
   */
  source?: "demo" | "sample";
};

export type MountDaylineArgs = {
  surface: HTMLCanvasElement;
  data: DaylineData;
  theme?: DaylineTheme;
  callbacks?: DaylineCallbacks;
  options?: DaylineMountOptions;
};

export type DaylineHandle = {
  update: (data: DaylineData) => void;
  setTheme: (theme: DaylineTheme) => void;
  resize: (width: number, height: number) => void;
  destroy: () => void;
  /** Spring now back to `nowRestFraction`. Re-enables now-follow. */
  goToNow?: () => void;
};

export type MountDayline = (args: MountDaylineArgs) => DaylineHandle;

export type { GlyphPrimitive } from "./glyphs";
export {
  CANCEL_BAR,
  DONE_CHECK,
  GLYPH_BOX,
  GLYPH_GEOMETRY,
  SCHEDULED_DAMP,
  SPIN,
  SPIN_ORIGIN,
  STROKE,
  TASK_REQUESTED,
} from "./glyphs";
