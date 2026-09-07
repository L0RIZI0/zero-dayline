import type { DaylineData, DaylineKind, DaylineMark } from "./contract";
import type { CalEvent, EventCategory } from "./types";
import { daysInMonth, zonedDate, zonedParts } from "./time";

function catOf(kind: DaylineKind): EventCategory {
  if (kind === "task") return "work";
  if (kind === "moment" || kind === "instant") return "focus";
  if (kind === "space") return "life";
  return "personal";
}

function parentKey(marks: DaylineMark[], parentId: string | null | undefined): string | undefined {
  if (!parentId) return undefined;
  return marks.find((m) => m.entityId === parentId)?.key;
}

export function shiftData(data: DaylineData, now: number): DaylineData {
  const d = now - data.now;
  if (d === 0) return data;
  return {
    ...data,
    now,
    marks: data.marks.map((m) => ({
      ...m,
      start: m.start != null ? m.start + d : undefined,
      end: m.end + d,
    })),
  };
}

export function childcareMarks(now: number): DaylineMark[] {
  const year = zonedParts(now).year;
  const last = zonedDate(year, 12, 24, 23, 59);
  const out: DaylineMark[] = [];
  let n = 0;
  for (let month = 1; month <= 12; month++) {
    const dim = daysInMonth(year, month);
    for (let day = 1; day <= dim; day++) {
      const noon = zonedDate(year, month, day, 12, 0);
      if (noon > last) return out;
      const wd = zonedParts(noon).weekdayIndex;
      if (wd !== 1 && wd !== 3) continue;
      const start = zonedDate(year, month, day, 7, 20);
      const end = zonedDate(year, month, day, 17, 30);
      out.push({
        key: `plan:childcare:${year}-${month}-${day}`,
        entityId: "childcare",
        kind: "task",
        track: "planned",
        start,
        end,
        title: "Childcare",
        glyph: { kind: "task", accent: "oklch(0.78 0.14 85)" },
        occRef: { id: "childcare", day: n },
      });
      n += 1;
    }
  }
  return out;
}

export function marksToEvents(data: DaylineData): CalEvent[] {
  const rails = {
    planned: true,
    recorded: false,
    access: false,
    ...data.rails,
  };
  const out: CalEvent[] = [];
  for (const m of data.marks) {
    if (m.track === "planned" && rails.planned === false) continue;
    if (m.track === "recorded" && !rails.recorded) continue;
    if (m.track === "access" && !rails.access) continue;
    const point = !!(m.point || m.instant || (m.start != null && m.start === m.end));
    out.push({
      id: m.key,
      title: m.title,
      start: m.start ?? m.end,
      end: Math.max(m.end, m.start ?? m.end),
      kind: point ? "milestone" : "event",
      category: catOf(m.kind),
      parentId: parentKey(data.marks, m.parentId),
      color: m.glyph.accent,
      track: m.track,
      point,
      ongoing: !!(m.ongoing || m.glyph.ongoing),
      openEnded: !!m.openEnded,
      unknownEnd: !!m.unknownEnd,
      unknownStart: !!m.unknownStart,
      cancelled: !!(m.cancelled || m.glyph.cancelled),
      auto: !!m.auto,
      mark: m,
    });
  }
  return out;
}
