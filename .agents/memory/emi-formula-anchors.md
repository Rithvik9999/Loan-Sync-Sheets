---
name: EMI formula anchors
description: Live EMI Heat Map layout and formula rules discovered while auditing the workbook.
---

The live EMI `Heat Map` tab uses row 5 for headers, row 6 for legacy formula anchors, and row 7 onward for real loan rows. Computed array formulas must be anchored at row 7 and read row-7 inputs; anchoring them at row 6 shifts every computed value into the previous loan's row and creates blank blocks.

**Why:** the Sheets API returns row 6 as a formula-only row, while the app's data scan is name-driven. A formula anchored one row earlier can look partly populated while every financial value is associated with the wrong borrower.

Payment-history marker counts must divide the removed character count by the marker length: `LEN(text)-LEN(SUBSTITUTE(text,":M",""))` counts characters, not `:M` entries. Use `/LEN(":M")` and `/LEN(":W")` (and equivalent markers) before using those counts in schedule formulas.

**How to apply:** when repairing this workbook, clear the legacy computed anchors in row 6, write all computed anchors at row 7, and verify both `FORMULA` and rendered-value reads for errors, false booleans, row alignment, and schedule dates.