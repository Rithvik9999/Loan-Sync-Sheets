---
name: Sheet-as-database architecture
description: Pattern for building an app on top of a user's real spreadsheet that already computes business logic via formulas.
---

When a user's source of truth is a spreadsheet tab with hand-built array formulas (e.g. ARRAYFORMULA/MAP) that compute derived fields (fees, interest, totals), the app must never reimplement that math.

**Rule:** treat computed columns as read-only. The backend writes only to designated input columns using targeted per-cell writes (e.g. Sheets API `values.batchUpdate` with individual single-cell ranges), never a full-row `values.append` or `values.update` that would blast across computed columns too — even writing an empty string into a spilled array-formula cell can break the spill.

**Why:** a full-row write (or `values.append`) writes into every column in the range, including ones that hold spilled array-formula output. Writing anything — even blanks — into a spilled cell breaks the formula's spill for that row.

**How to apply:**
- Map out the sheet's columns into input vs. computed before writing any code.
- Locate the "formula row" (the anchor row holding the master array formula) and never touch it (delete/edit) as it drives every row below it.
- After any input write, re-read the row fresh from the sheet to get the recalculated computed values — don't trust anything the app itself might have derived.
- Any relational lookups (e.g. joining a loan row to a borrower profile) that the sheet doesn't model natively can be resolved at request time by matching a natural key (e.g. name) rather than adding a foreign-key column the formulas don't expect.
