import type {
  DaylineHandle,
  MountDayline,
  MountDaylineArgs,
} from "./contract";
import { DaylineEngine } from "./engine";

/** Clock: pass { clock: "wall" } (default) so the engine owns now.
 *  source: "demo" is playground-only — Zero must not set it. */
export const mountDayline: MountDayline = (args: MountDaylineArgs): DaylineHandle => {
  const demo = args.options?.source === "demo";
  const engine = new DaylineEngine(
    args.surface,
    { onChange: () => {} },
    {
      persist: demo,
      clock: args.options?.clock ?? "wall",
      data: demo ? undefined : args.data,
      source: demo ? "demo" : "sample",
      theme: args.theme,
      callbacks: args.callbacks,
      nowRestFraction: args.options?.nowRestFraction,
      dpr: args.options?.dpr,
      skyBleedPx: args.options?.skyBleedPx,
    },
  );
  return {
    update: (data) => engine.loadData(data),
    setTheme: (theme) => engine.setContractTheme(theme),
    resize: (width, height) => engine.resizeTo(width, height),
    destroy: () => engine.destroy(),
  };
};

export { DaylineEngine };
