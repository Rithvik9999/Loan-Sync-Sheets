---
name: EMI formula anchors
description: Live EMI Heat Map layout and formula rules discovered while auditing the workbook.
---

The live EMI `Heat Map` tab uses row 5 for headers, row 6 for array-formula anchors, and row 7 onward for real loan rows. Computed array formulas must be anchored at row 6 so their initial blank result occupies the legacy anchor row and the first computed loan value aligns with row 7.

**Why:** the Sheets API returns row 6 as a formula-only row, while the app's data scan is name-driven. A formula anchored at row 7 collides with the first real row and blocks the array spill, causing `#REF!` values and an unusable EMI listing.

Payment-history marker counts must divide the removed character count by the marker length: `LEN(text)-LEN(SUBSTITUTE(text,":M",""))` counts characters, not `:M` entries. Use `/LEN(":M")` and `/LEN(":W")` (and equivalent markers) before using those counts in schedule formulas.

**How to apply:** when repairing this workbook, clear duplicate computed cells in row 7, write all computed anchors at row 6, and verify both `FORMULA` and rendered-value reads for errors, false booleans, row alignment, and schedule dates.