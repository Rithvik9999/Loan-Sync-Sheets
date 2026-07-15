---
name: Orval regenerates a conflicting barrel re-export in api-zod
description: Running the api-spec codegen (orval) re-appends duplicate wildcard exports to lib/api-zod/src/index.ts, breaking the build.
---

Every time `pnpm run codegen` (orval) runs for this project's OpenAPI spec, it
appends `export * from './generated/api';` and `export * from './generated/types';`
to the end of `lib/api-zod/src/index.ts`, even though that file already has
carefully scoped named type re-exports earlier (to avoid the Zod schema and
TS-type both being named e.g. `LoginBody` and colliding on `export *`).

**Why:** orval's generator writes/updates a barrel index near its output
target as a convenience feature; it doesn't know about the hand-maintained
disambiguation exports already in that file, so it just appends and creates
`TS2308` "already exported a member" errors on the next typecheck.

**How to apply:** after running the api-spec `codegen` script, always check
`lib/api-zod/src/index.ts` for these two trailing duplicate lines and delete
them before running `pnpm -w run typecheck:libs` (or the codegen script's own
typecheck step will fail).
