# Memory Index

- [Sheet-as-database architecture](sheet-as-database.md) — read spreadsheet formulas, write only input columns; never recompute business math the sheet already owns.
- [Workspace TS project-references build](ts-project-references-build.md) — use root `pnpm run typecheck`, not ad hoc `tsc --noEmit` in a subpackage, or you'll see spurious `TS6305`.
- [Google Sheets grid row limits](sheets-grid-row-limit.md) — appending past a tab's physical `gridProperties.rowCount` fails; grow the grid first so array formulas can spill into the new row.
- [Raw-imported repl artifact registration](raw-import-artifact-registration.md) — a repl with full artifact.toml files but empty `listArtifacts()`/no workflows is a raw import; the platform auto-registers it shortly, no need to force a migration.
- [Sheet array formulas need iterative calculation](sheets-self-referencing-formulas.md) — "keep existing value" columns self-reference their own column inside MAP/ARRAYFORMULA; this only works if Sheets' iterative calculation is enabled, and copy-paste errors here silently leak the wrong column's value.
- [Express path-scoped router middleware](express-path-middleware-scope.md) — router.use(middleware) without a path blocks ALL requests entering that router; always scope to router.use("/prefix", middleware).
- [Orval barrel re-export conflict](orval-barrel-reexport-conflict.md) — api-spec codegen re-appends duplicate wildcard exports to lib/api-zod/src/index.ts; strip them after every codegen run or typecheck breaks.
- [Sheets column rename is positional](sheets-column-rename.md) — sheetsClient maps by header array order, not sheet header text; renaming a field in code needs no data migration.
- [wa.me link country code](wa-me-links.md) — always prepend 91 to sanitized 10-digit phone before building a wa.me link, or WhatsApp fails to open the chat.
- [Borrower directory merge key](borrower-directory-merge.md) — merge loan-sheet and Borrowers-tab records by normalized phone first, name only as fallback.
