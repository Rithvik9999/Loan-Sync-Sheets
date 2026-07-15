# Memory Index

- [Sheet-as-database architecture](sheet-as-database.md) — read spreadsheet formulas, write only input columns; never recompute business math the sheet already owns.
- [Workspace TS project-references build](ts-project-references-build.md) — use root `pnpm run typecheck`, not ad hoc `tsc --noEmit` in a subpackage, or you'll see spurious `TS6305`.
- [Google Sheets grid row limits](sheets-grid-row-limit.md) — appending past a tab's physical `gridProperties.rowCount` fails; grow the grid first so array formulas can spill into the new row.
