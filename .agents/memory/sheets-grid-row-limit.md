---
name: Google Sheets grid row limits
description: Writing/appending a new row past a tab's current physical grid size fails with a 400 "exceeds grid limits" error.
---

A Google Sheets tab has a physical grid size (`sheet.properties.gridProperties.rowCount`) independent of how many rows currently contain data. If your last data row happens to sit exactly at the grid's row limit, writing to `rowNumber = lastRow + 1` via `values.batchUpdate`/`values.update` fails with a 400 error like: `Range ('Tab'!A252) exceeds grid limits. Max rows: 251, max columns: 32`.

**Why:** the Sheets API rejects writes to cells outside the sheet's current grid dimensions, and any array formula (ARRAYFORMULA/MAP) anchored on an earlier row can only spill its output into rows that physically exist in the grid — growing the grid is what lets the formula's computed columns populate for the new row too.

**How to apply:** before writing a new row that may be at or beyond the current grid boundary, check `gridProperties.rowCount` via `spreadsheets.get` and grow it first with a `batchUpdate` `appendDimension` request (`dimension: "ROWS"`) sized to cover the target row number. Do this defensively on every row-append, not just when it happens to be near a boundary — the boundary can be silently already at the last used row.
