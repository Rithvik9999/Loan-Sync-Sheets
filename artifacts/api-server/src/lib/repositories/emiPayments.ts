/**
 * EmiPayments — partial payment records for EMI loans (per-month tracking).
 * Stored in an "EmiPayments" tab in the EMI Google Spreadsheet.
 * Columns (row 1 = headers, row 2+ = data):
 *   A(0) id | B(1) emiId | C(2) amount | D(3) date | E(4) monthKey | F(5) note
 *
 * monthKey format: "YYYY-MM" (identifies which month's EMI this partial belongs to).
 * Multiple partials for the same month accumulate until the admin marks the month paid.
 */
import { randomUUID } from "node:crypto";
import {
  getEmiSpreadsheetId,
  getRawValuesFromSheet,
  batchUpdateCellsInSheet,
  ensureGridRowCountForSheet,
  ensureSheetTabInSheet,
} from "../sheetsClient";

const TAB = "EmiPayments";
const HEADERS = ["id", "emiId", "amount", "date", "monthKey", "note"];
const COL = {
  ID: 0,
  EMI_ID: 1,
  AMOUNT: 2,
  DATE: 3,
  MONTH_KEY: 4,
  NOTE: 5,
} as const;
const LAST_COL = "F";

export interface EmiPayment {
  id: string;
  emiId: string;
  amount: number;
  date: string;
  monthKey: string; // YYYY-MM
  note: string;
}

function toPayment(row: unknown[]): EmiPayment | null {
  const id = String(row[COL.ID] ?? "").trim();
  if (!id) return null;
  const rawAmount = row[COL.AMOUNT];
  return {
    id,
    emiId: String(row[COL.EMI_ID] ?? ""),
    amount: typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount ?? "")) || 0,
    date: String(row[COL.DATE] ?? ""),
    monthKey: String(row[COL.MONTH_KEY] ?? ""),
    note: String(row[COL.NOTE] ?? ""),
  };
}

async function findNextRow(): Promise<number> {
  const sheetId = getEmiSpreadsheetId();
  const raw = await getRawValuesFromSheet(sheetId, `${TAB}!A2:A`);
  let last = 1;
  raw.forEach((r, i) => {
    if (r[0] && String(r[0]).trim()) last = 2 + i;
  });
  return last + 1;
}

export async function listEmiPayments(emiId?: string): Promise<EmiPayment[]> {
  const sheetId = getEmiSpreadsheetId();
  await ensureSheetTabInSheet(sheetId, TAB, HEADERS);
  const raw = await getRawValuesFromSheet(sheetId, `${TAB}!A2:${LAST_COL}`);
  const all = raw.map(toPayment).filter((p): p is EmiPayment => p !== null);
  return emiId ? all.filter((p) => p.emiId === emiId) : all;
}

export async function createEmiPayment(
  emiId: string,
  amount: number,
  date: string,
  monthKey: string,
  note = "",
): Promise<EmiPayment> {
  const sheetId = getEmiSpreadsheetId();
  await ensureSheetTabInSheet(sheetId, TAB, HEADERS);
  const rowNumber = await findNextRow();
  await ensureGridRowCountForSheet(sheetId, TAB, rowNumber);
  const id = randomUUID();
  await batchUpdateCellsInSheet(sheetId, [
    {
      range: `${TAB}!A${rowNumber}:${LAST_COL}${rowNumber}`,
      values: [[id, emiId, amount, date, monthKey, note]],
    },
  ]);
  return { id, emiId, amount, date, monthKey, note };
}
