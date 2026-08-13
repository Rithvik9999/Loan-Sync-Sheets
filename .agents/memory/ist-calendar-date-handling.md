---
name: IST calendar-date handling
description: Business rules for date-only loan and payment values in the borrower portal.
---

Loan and payment dates are India calendar dates, not UTC timestamps. Browser/server timezone differences can move a date across midnight and make a payment due today appear due tomorrow.

**Why:** The portal previously derived “today paid” from cumulative payment amounts and mixed local dates with `T00:00:00Z`; older payments could therefore incorrectly cover today and date-only values could drift by one day.

**How to apply:** Use the shared IST today/date-only helpers for defaults and comparisons. Use actual dated payment entries (`partPayments` or the stacked date field) to determine whether today was paid; cumulative totals are only for counting older installments.