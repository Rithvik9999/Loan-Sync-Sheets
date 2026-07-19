---
name: Credit limit utilisation vs Total Due — two separate calculations
description: How credit used (limit) and total due (financial obligation) differ and where each is used
---

## The Two Values

### Total Due (`totalOutstanding`)
What the borrower actually owes in cash — financial obligation including fees and interest:
- Regular loans: `max(finalAmount - paid, 0)`
- EMI loans: `monthlyPayment × max(remainingMonths, 0)` (falls back to `e.principal` if uninitialized)

### Credit Used (`usedPrincipal`) — for credit limit donut / borrower list
How much of the lender's capital is currently deployed — principal-based, accounting for partial payments:
- Regular loans: `l.principal` (original principal, no deduction — we can't split paid into principal vs. fees)
- EMI loans: `principalPerMonth × remainingMonths` if available, else `principal × rem/tenure` proportional,
  else full `e.principal` (fallback when tracking hasn't started)

**Why EMI deducts paid months:** Paying 8 of 12 EMI months means only 4 months of principal remain
deployed. Using original principal would show 100% credit used forever even for nearly-cleared loans.

### Server-side credit limit check (new loan requests)
Uses `e.principal` (original, not remaining) — conservative underwriting intentional.
Endpoint: `artifacts/api-server/src/routes/loan-requests.ts`.

## Credit limit percentage display
- Computed as `round(usedPrincipal / creditLimit × 100)` — NOT capped at 100.
- Over-limit state (`isOverLimit`): show full red circle in pie, show actual `usedPct%` (e.g. "115%").
- Available credit = `max(creditLimit - usedPrincipal, 0)` — shown as "₹X free" below donut.

## Files
- Portal homepage: `artifacts/loan-tracker/src/pages/portal.tsx` — `totalOutstanding`, `usedPrincipal`, donut
- Borrower list: `artifacts/loan-tracker/src/pages/borrowers/list.tsx` — `BorrowerEntry.creditUsed`, `.totalDue`
- Server check: `artifacts/api-server/src/routes/loan-requests.ts`

## floorRepaymentAmount
Rounding formula: `amount < 1000 → floor(amount/5)×5`, else `floor(amount/10)×10`.
Duplicated in 3 files (portal.tsx, loan-form-dialog.tsx, loan-requests-detail.tsx).
Admin loan-request detail auto-populates discount = `estimateFinalAmount() - floorRepaymentAmount()`.
