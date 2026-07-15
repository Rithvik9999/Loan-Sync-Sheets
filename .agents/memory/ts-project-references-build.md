---
name: Workspace TS project-references build
description: Correct way to typecheck in a pnpm monorepo that uses TS project references (composite builds) across shared libs and artifacts.
---

In a pnpm workspace where shared libs (`lib/*`) use TypeScript project references with `composite`/incremental builds, running `tsc --noEmit` directly inside an artifact subpackage can fail with `TS6305` (stale or missing `dist/*.d.ts` declaration files) even when the code is correct.

**Why:** the artifact's tsconfig references the libs by their built declaration output, not their source; if the libs haven't been built (or were built stale), `tsc --noEmit` in the subpackage can't find valid declarations and errors out in a way that looks like a real type error but isn't.

**How to apply:** always use the repo-root `pnpm run typecheck` script (which runs `tsc --build` for the referenced libs first, then per-artifact typechecks) instead of ad hoc `tsc --noEmit` inside a subpackage. If you must isolate one artifact, build the libs first, then run its typecheck.
