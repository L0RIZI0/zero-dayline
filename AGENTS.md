# @zero/dayline

- Public surface is `src/index.ts` and `src/contract.ts`. Do not redesign `src/engine.ts`.
- `clock` defaults to `"wall"`. Hosts must not push `now` every second.
- Resize-start/end must set `moved` and push undo past the 2px threshold, same as drag-event.
- `loadData` queues a snapshot while a drag/resize is in progress; apply on pointer up.
- `seed.ts` is demo-only. Zero mounts with host `data` and `persist: false`; `source: "demo"` is the playground switch.
- Glyph silhouettes live in `src/glyphs.ts` (Zero spec). Do not eyeball replacements. Spin-once + flash-fill are driven from `noteGlyphFx` (new marks, counter bumps, ongoing→stopped).
- Sky curves: `data.sky.{sun,moon}`. Sun default on, moon default off. Moon uses `moonUnit` — 0 at moonrise/moonset, C1 through the night, hover shows crescent + times. Sample visible span only (pan uses a cheap stroke).
- Never push to `main`. Branch + PR. Release only via `workflow_dispatch` on `.github/workflows/release.yml`.
- Consume as raw TypeScript (`transpilePackages`). No emit, no dist.
