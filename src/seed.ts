import type { CalEvent } from "./types";

/** Host apps pass DaylineData through mount; local persist is off by default. */
export function seedCalendar(_now: number): CalEvent[] {
  return [];
}

export function loadEvents(_now: number): CalEvent[] {
  return [];
}

export function saveEvents(_events: CalEvent[]) {}
