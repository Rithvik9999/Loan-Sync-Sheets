---
name: Sheet array formulas need iterative calculation
description: Google Sheets "keep existing value" pattern in MAP/ARRAYFORMULA columns self-references their own column, which only works with iterative calculation enabled, and is prone to wrong-column copy-paste bugs.
---

Some hand-built lending-ledger sheets (e.g. BorrowApp's Heat Map / EMI sheets) implement a "keep whatever's already there unless a condition triggers a recompute" pattern by having a column's own master `MAP(...)` array formula pass one of its `LAMBDA` params back as the self-reference — e.g. a "Late days" or "Remaining months" column's formula includes its own column range as one of the `MAP` inputs, and returns that param verbatim in the passthrough branch.

**Why this matters:** This is a real self-reference (the formula lives in that column and reads that column), which is normally a circular-reference error in Sheets. It only works because the spreadsheet has iterative calculation enabled (Sheets settings), letting the formula converge to a steady "sticky override" value. If iterative calculation is ever turned off, every column using this pattern will show circular-reference errors sheet-wide.

**Copy-paste risk:** Because the pattern involves several `MAP` params (e.g. `LAMBDA(g, d, h, ...)`), it's easy to accidentally return the *wrong* param in the passthrough branch — e.g. returning the Principal column's param instead of the column's own value — which silently leaks an unrelated column's number into this column display (a bug found in BorrowApp's EMI sheet's "Return Date of month" column).

**How to apply:** When auditing or writing formulas in these sheets, verify the passthrough param in any self-referencing MAP/ARRAYFORMULA actually maps to that same column's own range, not a different column — and note iterative calculation as a hidden dependency worth flagging to the user.
