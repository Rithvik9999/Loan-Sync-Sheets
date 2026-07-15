# BorrowApp — Private Loan Tracker

A private lending management app for one lender/admin with a borrower-facing portal.

## Run & Operate

- `pnpm --filter @workspace/loan-tracker run dev` — run the React frontend (port assigned by Replit)
- `pnpm --filter @workspace/api-server run dev` — run the Express API server (port assigned by Replit)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build lib declaration files (run before frontend typecheck)
- `pnpm --filter @workspace/db run push` — push DB schema changes (not used; all data lives in Google Sheets)

## Required Environment Variables

Set these as Replit Secrets before the app will function:

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Random string for signing JWT session cookies |
| `ADMIN_PASSWORD` | Password for admin login (phone: 8917656405) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email from Google Cloud |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | PEM private key (with `\n` as newlines) |
| `GOOGLE_SHEET_ID` | ID of the Google Sheet (from the URL) |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS + shadcn/ui
- API: Express 5
- DB: **Google Sheets** (via Service Account) — no Supabase/Postgres needed
- Auth: Phone + password, JWT session cookies (stateless, Vercel-friendly)
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec)

## Where Things Live

- `artifacts/loan-tracker/` — React frontend
- `artifacts/api-server/` — Express API server
- `lib/api-spec/openapi.yaml` — Single source of truth for API contract
- `lib/api-zod/` — Zod validation schemas generated from OpenAPI spec
- `lib/api-client-react/` — React Query hooks generated from OpenAPI spec
- `lib/db/` — Drizzle ORM setup (reserved; not currently used for storage)
- `artifacts/api-server/src/lib/sheetsClient.ts` — Google Sheets read/write client
- `artifacts/api-server/src/lib/heatMapSheet.ts` — Loan data reader/writer (Heat Map tab)
- `artifacts/api-server/src/lib/repositories/` — Data access: borrowers, loans, loan requests

## Google Sheet Structure

The app expects these tabs in your spreadsheet:
- **Heat Map** — Main loan ledger (rows 5=header, 6=formula row, 7+=data)
- **Borrowers** — User accounts with bcrypt password hashes
- **LoanRequests** — Borrower-submitted loan requests

The Heat Map tab uses array formulas for computed columns (interest, late fees, etc.). Never overwrite the formula row (row 6).

## Auth Flow

- Admin: phone `8917656405` + `ADMIN_PASSWORD` env var → staff role, full access
- Borrowers: phone + password (set by admin, stored as bcrypt hash in Borrowers sheet tab)
- No signup; admin creates borrower accounts
- Session: httpOnly JWT cookie, 30-day expiry, stateless (Vercel-compatible)

## Borrower Portal Features

- View their own loans only (filtered server-side by name match)
- Request new loans (stored in LoanRequests sheet tab, admin reviews in app)
- Repay: UPI deep link to `9438556400@slc` for any amount (full outstanding or custom)

## Architecture Decisions

- Google Sheets as the primary database — no separate DB service needed; the lender already manages the spreadsheet
- Passwords stored as bcrypt hashes in the Borrowers sheet (never plain text)
- Loan math (interest, late fees, final amount) computed by sheet formulas — the API never recalculates, only reads
- Stateless JWT cookies (not server sessions) — allows deployment on Vercel serverless

## Vercel Deployment Notes

- The API server builds to a CJS bundle via esbuild (`artifacts/api-server/build.mjs`)
- For Vercel: deploy `artifacts/api-server` as a Node.js serverless function / Express app
- For Vercel: deploy `artifacts/loan-tracker` as a static site (Vite build → `dist/public/`)
- Set all Required Environment Variables in the Vercel project settings

## User Preferences

- Currency: Indian Rupees (₹)
- Admin phone: 8917656405
- UPI payment recipient: 9438556400@slc
- Contact admin WhatsApp: wa.me/918917656405
- No signup — admin manages all user accounts
