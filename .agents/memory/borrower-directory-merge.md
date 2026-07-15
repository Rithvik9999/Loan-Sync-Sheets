---
name: Borrower directory merge key
description: How BorrowApp unifies loan-sheet-derived borrowers with registered Borrowers-tab records.
---

The admin Borrowers directory merges two sources: rows implied by the
Loans/EMI sheets (by name) and explicit records in the Borrowers tab (with
phone + PIN). These must be matched by **normalized phone number first,
falling back to normalized name** when no phone is available on either side.

**Why:** matching by name alone splits one real borrower into two directory
rows whenever the name differs even slightly between sheets (case, spacing,
nickname) — this was the root cause of a persistent "PIN not set up" badge
showing for borrowers who actually had a PIN configured under a
differently-spelled name.

**How to apply:** any future directory/merge logic touching loans + borrowers
must key on normalized phone (digits only, strip leading `91`/`0` country
code/trunk prefix) as the primary match, with normalized name as a secondary
fallback — never name-only.
