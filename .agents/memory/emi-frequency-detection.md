---
name: EMI frequency detection and button logic
description: How daily/weekly/bimonthly EMI loans are detected and which quick-pay buttons to show
---

## The Rule

Only ONE frequency type applies per EMI loan. Show ONLY the matching quick-pay button.
Normal monthly EMI loans get NO sub-frequency buttons — just the main "Monthly Payment" button.

## Detection

```javascript
// Key: check (field != null && field > 0), NOT just (field != null).
// The UI computes dailyAmount/weeklyAmount/bimonthlyAmount as fallback display values
// (monthly ÷ 30 / 4 / 2) even when the sheet has no custom value — those computed
// values must NOT trigger the frequency flag.

const isBimonthlyLoan = !!(
  (loan.bimonthlyAmount != null && loan.bimonthlyAmount > 0) ||
  _notesText.includes("bimonthly") ||
  (loan.paidDates ?? []).some(e => ["BM","BMM"].includes(e.split(":")[2]))
);
const isWeeklyLoan = !!(
  (loan.weeklyAmount != null && loan.weeklyAmount > 0) ||
  _notesText.includes("pay weekly") ||
  (loan.paidDates ?? []).some(e => ["W","WM"].includes(e.split(":")[2]))
);
const isDailyLoan = !!(
  (loan.dailyAmount != null && loan.dailyAmount > 0) ||
  _notesText.includes("pay daily")
);
```

## Button rendering

```jsx
{isDailyLoan && <Button onClick={handleDailyPayment}>Daily ₹X</Button>}
{isWeeklyLoan && <Button onClick={handleWeeklyPayment}>Weekly ₹X</Button>}
{isBimonthlyLoan && <Button onClick={handleBimonthlyPayment}>Bimonthly ₹X</Button>}
```

**Why:** Previous logic `!isWeeklyLoan && !isBimonthlyLoan` for daily showed the button on ALL
normal monthly EMI loans. Adding `isDailyLoan` as a negative condition broke weekly loans
because 0-valued sheet columns were truthy for `!= null`. The `> 0` guard is essential.

## Installment count display (stats panel)

- Bimonthly/weekly loans: show `remainingInstallments / totalInstallments remaining` where
  remainingInstallments = `totalInstallments - count(BM/BMM or W/WM entries in paidDates)`
  (NOT from `remainingMonths × multiplier` — calendar months diverge from installment count)
- Normal monthly EMI: show `remainingMonths / tenureMonths months remaining`
