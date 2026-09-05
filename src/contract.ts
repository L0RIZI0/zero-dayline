export type DaylineKind =
  | "task"
  | "moment"
  | "space"
  | "community"
  | "resource"
  | "individual"
  | "place";

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
  sessionAnchorId?: string;
};

export type DaylineData = {
  now: number;
  marks: DaylineMark[];
  rails?: { planned?: boolean; recorded?: boolean; access?: boolean };
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
  onSessionMenu?: (entityId: string, sessionAnchorId: string | undefined, x: number, y: number) => void;
  onBandMenu?: (x: number, y: number) => void;
  onOccurrenceRetime?: (entityId: string, occRef: DaylineOccRef | undefined, start: number, end: number) => void;
  onSessionRetime?: (entityId: string, sessionAnchorId: string | undefined, start: number, end: number) => void;
};

export type DaylineMountOptions = {
  clock?: "wall" | "data";
  nowRestFraction?: number;
  dpr?: number;
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
