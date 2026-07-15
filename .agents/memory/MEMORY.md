# Memory Index

- [Sheet-as-database architecture](sheet-as-database.md) — read spreadsheet formulas, write only input columns; never recompute business math the sheet already owns.
- [Workspace TS project-references build](ts-project-references-build.md) — use root `pnpm run typecheck`, not ad hoc `tsc --noEmit` in a subpackage, or you'll see spurious `TS6305`.
- [Google Sheets grid row limits](sheets-grid-row-limit.md) — appending past a tab's physical `gridProperties.rowCount` fails; grow the grid first so array formulas can spill into the new row.
- [Raw-imported repl artifact registration](raw-import-artifact-registration.md) — a repl with full artifact.toml files but empty `listArtifacts()`/no workflows is a raw import; the platform auto-registers it shortly, no need to force a migration.
- [Sheet array formulas need iterative calculation](sheets-self-referencing-formulas.md) — "keep existing value" columns self-reference their own column inside MAP/ARRAYFORMULA; this only works if Sheets' iterative calculation is enabled, and copy-paste errors here silently leak the wrong column's value.
