# @zero/dayline

Canvas dayline engine. Zero installs a **pinned tag**:

```json
"@zero/dayline": "github:L0RIZI0/zero-dayline#v0.2.0"
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

Playground only: `options: { source: "demo" }` loads the built-in calendar (`seed.ts`) and persists to `localStorage`. Zero must not set this — host `data` stays the source of truth and persist stays off.

## Release

Releases are **manual**. GitHub Actions → *release* → Run workflow → version `0.2.0` (no `v`). That type-checks and pushes tag `v0.2.0`.

Never push straight to `main`. Feature branch + PR.