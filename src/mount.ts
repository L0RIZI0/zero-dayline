import type {
  DaylineHandle,
  MountDayline,
  MountDaylineArgs,
} from "./contract";
import { DaylineEngine } from "./engine";

/** Clock: pass { clock: "wall" } (default) so the engine owns now. */
export const mountDayline: MountDayline = (args: MountDaylineArgs): DaylineHandle => {
  const engine = new DaylineEngine(
    args.surface,
    { onChange: () => {} },
    {
      persist: false,
      clock: args.options?.clock ?? "wall",
      data: args.data,
      theme: args.theme,
      callbacks: args.callbacks,
      nowRestFraction: args.options?.nowRestFraction,
      dpr: args.options?.dpr,
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
