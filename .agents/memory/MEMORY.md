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
- [EMI frequency detection and button logic](emi-frequency-detection.md) — check `field > 0` not `field != null`; show only the matching quick-pay button; normal monthly EMI gets no sub-frequency buttons.
- [Credit limit utilisation vs Total Due](credit-limit-vs-total-due.md) — two separate values: totalDue = financial obligation (finalAmount-paid / monthlyPayment×rem), creditUsed = deployed principal (regular: original principal; EMI: principalPerMonth×remainingMonths).
- [Loan UUID lookup resilience](loan-uuid-lookup.md) — getLoanRow/getEmiLoanRow must fall back to loanId/emiId if UUID not found; trim id in parseRow to handle whitespace in sheet cells.
- [EMI Archived status](emi-archived-status.md) — EmiLoanStatus now includes "Archived"; backend PATCH /emi-loans/:id passes body straight to updateEmiLoanRow with no enum validation, so no Zod schema change needed.
