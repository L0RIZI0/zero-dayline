# @zero/dayline

- Public surface is `src/index.ts` and `src/contract.ts`. Do not redesign `src/engine.ts`.
- `clock` defaults to `"wall"`. Hosts must not push `now` every second.
- Resize-start/end must set `moved` and push undo past the 2px threshold, same as drag-event.
- `loadData` queues a snapshot while a drag/resize is in progress; apply on pointer up.
- Never push to `main`. Branch + PR. Release only via `workflow_dispatch` on `.github/workflows/release.yml`.
- Consume as raw TypeScript (`transpilePackages`). No emit, no dist.
