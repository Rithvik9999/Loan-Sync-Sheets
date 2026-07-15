---
name: Google Sheets column rename via sheetsClient is positional, not by header text
description: How BorrowApp's sheetsClient.readTab/appendRow/updateRowAt map data to columns — relevant any time a sheet-backed field is renamed.
---

`artifacts/api-server/src/lib/sheetsClient.ts`'s `readTab`/`appendRow`/
`updateRowAt` map row data to spreadsheet columns purely by **position**
(the order of the `headers: string[]` array the caller passes in), not by
matching against the literal text in the sheet's row-1 header cells.
`ensureSheetTab` only ever writes the header row once, when a tab doesn't
exist yet — it never re-syncs headers for a tab that already exists.

**Why:** this means renaming a field in code (e.g. changing a repository's
`HEADERS` array from `"passwordHash"` to `"pin"` at the same index) requires
no data migration and doesn't break reads/writes — the column keeps the same
position, only the code's label for it changes. But it also means the actual
text in the sheet's row-1 header cell goes stale (still shows the old name)
until someone edits it by hand; that's cosmetic only, not required for the
app to keep working.

**How to apply:** when repurposing a spreadsheet-backed column (rename,
change semantics), just change the `HEADERS` array label in the repository
file — don't attempt to programmatically rewrite the sheet's header row
unless the user asks for the visible label to be fixed, and don't assume old
values need clearing unless the new semantics require fresh data (e.g.
plaintext PINs replacing bcrypt hashes — those old hash values will simply
never match a 6-digit PIN comparison, so no explicit wipe is needed either).
