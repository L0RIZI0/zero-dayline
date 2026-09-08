# @zero/dayline

Canvas dayline engine. Zero installs a **pinned tag**:

```json
"@zero/dayline": "github:L0RIZI0/zero-dayline#v0.7.18"
```

Add `@zero/dayline` to Next.js `transpilePackages`. There is no build output; `main` / `module` / `types` / `exports` point at `src/index.ts`.

```ts
import { mountDayline } from "@zero/dayline";

const handle = mountDayline({
  surface,
  data,
  theme,
  callbacks,
  options: { clock: "wall" },
});
```

`clock: "wall"` (default) means the engine owns `now`. Do not push a new timestamp from the host every second.

`options.skyBleedPx` (default 0): extra transparent pixels below the band. Layout stays on `height - skyBleedPx`; only sun/moon strokes draw into the bleed. Size the `<canvas>` to `bandHeight + skyBleedPx` and overlay the bleed with `pointer-events: none`. Mount-time only.

Sky: `data.sky = { sun?: boolean, moon?: boolean }` — sun defaults on, moon off. Drawn as Hermite cubics through rise/peak/set (no dense sampling). Hover is closed-form `y(t)`. Moon crosses the axis at moonrise/moonset.

Playground only: `options: { source: "demo" }` loads the built-in calendar (`seed.ts`) and persists to `localStorage`. Zero must not set this — host `data` stays the source of truth and persist stays off.

Glyphs follow Zero's 24×24 spec (`src/glyphs.ts`). New marks flash-fill; instants also spin-once. Pass `glyph.spinOnce` / `glyph.flashFill` counters to retrigger on an existing mark. Map `glyph.filled` / `scheduled` / `requested` from the face model so complete / scheduled / request states match the SVG glyphs.

## Release

Releases are **manual**. GitHub Actions → *release* → Run workflow → version `0.7.18` (no `v`). That type-checks and pushes tag `v0.7.18`.

Never push straight to `main`. Feature branch + PR.