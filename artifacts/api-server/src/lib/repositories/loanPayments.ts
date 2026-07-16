/**
 * LoanPayments — multiple partial payment records for regular loans.
 * Stored in a "LoanPayments" tab in the main Google Spreadsheet.
 * Columns (row 1 = headers, row 2+ = data):
 *   A(0) id | B(1) loanId | C(2) amount | D(3) date | E(4) note
 */
import { randomUUID } from "node:crypto";
import {
  getRawValues,
  batchUpdateCells,
  ensureSheetTab,
  ensureGridRowCount,
} from "../sheetsClient";

const TAB = "LoanPayments";
const HEADERS = ["id", "loanId", "amount", "date", "note"];
const COL = { ID: 0, LOAN_ID: 1, AMOUNT: 2, DATE: 3, NOTE: 4 } as const;

export interface LoanPayment {
  id: string;
  loanId: string;
  amount: number;
  date: string;
  note: string;
}

function toPayment(row: unknown[]): LoanPayment | null {
  const id = String(row[COL.ID] ?? "").trim();
  if (!id) return null;
  const rawAmount = row[COL.AMOUNT];
  return {
    id,
    loanId: String(row[COL.LOAN_ID] ?? ""),
    amount: typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount ?? "")) || 0,
    date: String(row[COL.DATE] ?? ""),
    note: String(row[COL.NOTE] ?? ""),
  };
}

async function findNextRow(): Promise<number> {
  const raw = await getRawValues(`${TAB}!A2:A`);
  let last = 1; // row 1 is the header
  raw.forEach((r, i) => {
    if (r[0] && String(r[0]).trim()) last = 2 + i;
  });
  return last + 1;
}

export async function listLoanPayments(loanId?: string): Promise<LoanPayment[]> {
  await ensureSheetTab(TAB, HEADERS);
  const raw = await getRawValues(`${TAB}!A2:E`);
  const all = raw.map(toPayment).filter((p): p is LoanPayment => p !== null);
  return loanId ? all.filter((p) => p.loanId === loanId) : all;
}

export async function createLoanPayment(
  loanId: string,
  amount: number,
  date: string,
  note = "",
): Promise<LoanPayment> {
  await ensureSheetTab(TAB, HEADERS);
  const rowNumber = await findNextRow();
  await ensureGridRowCount(TAB, rowNumber);
  const id = randomUUID();
  await batchUpdateCells([
    {
      range: `${TAB}!A${rowNumber}:E${rowNumber}`,
      values: [[id, loanId, amount, date, note]],
    },
  ]);
  return { id, loanId, amount, date, note };
}
