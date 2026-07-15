---
name: Sheet-as-database architecture
description: BorrowApp's Heat Map sheet owns all loan financial math via array formulas; the app must never recompute it, only read/write specific columns.
---

The "Heat Map" Google Sheet tab is the authoritative ledger for BorrowApp
loans. Row 6 holds master `ARRAYFORMULA`/`MAP`/`LAMBDA` formulas that spill
down every data row, computing flat fee, interest %, interest, late days,
late fees, and final amount from a few input columns (principal, tenure
days, transaction date, discount/charges, part payment). The app only reads
the computed columns and writes the input columns — it never overwrites row
6 or recomputes this math server-side.

**Why:** the lender explicitly runs their business off this sheet; any code
path that silently overwrote a computed cell would corrupt every row below
it (array formulas spill from a single anchor cell).

**How to apply:** if a feature needs a "what-if" figure the sheet doesn't
directly expose (e.g. an early-repayment discount estimate), replicate the
sheet's tier logic in a clearly-documented client-side helper that computes
an *estimate* only — never write it back automatically. Any change to what
gets charged still goes through the existing manual "Discount/Charges"
input column, entered by a human after verifying the payment. Pull the
exact formula text via `getRawValues(range, 'FORMULA')` on the sheet's
formula row before replicating any tier/rate logic — don't guess at
percentages or day-boundaries from memory.
