/**
 * Typed access to the EMI (monthly installment) loan ledger.
 *
 * This is a SEPARATE Google Spreadsheet (EMI_GOOGLE_SHEET_ID), with a tab
 * also named "Heat Map". The structure differs from the main Heat Map:
 *  - Tenure is in MONTHS (not days)
 *  - Monthly payment computed by the sheet's array formulas
 *  - Row 5: headers, Row 6+: data rows (row 6 also holds the array formulas
 *    that spill down — it IS a real data row, unlike the main sheet's row 6
 *    which is a placeholder "Formula row").
 *
 * Column map (0-indexed):
 *  A(0)  id                  — bookkeeping UUID
 *  B(1)  statusNotes         — manual free-text note (e.g. "Next 15 Aug")
 *  C(2)  nextPaymentDate     — COMPUTED: next monthly due date
 *  D(3)  name                — input
 *  E(4)  monthlyPayment      — COMPUTED: (principal + total interest) / tenure
 *  F(5)  transactionDate     — input (serial date)
 *  G(6)  principal           — input
 *  H(7)  tenureMonths        — input
 *  I(8)  flatFee             — COMPUTED: principal * 2.5%
 *  J(9)  interestPct         — COMPUTED: tiered rate
 *  K(10) interestPerMonth    — COMPUTED: declining-balance avg monthly interest
 *  L(11) totalInterest       — COMPUTED: K * H + I
 *  M(12) discountPerMonth    — input (negative = discount)
 *  N(13) principalPerMonth   — COMPUTED: principal / tenure
 *  O(14) status              — input ("Pending" | "Clear")
 *  P(15) whatsapp            — input
 *  Q(16) lateFees            — COMPUTED
 *  R(17) remainingMonths     — COMPUTED
 *  S(18) notes               — input
 */
import { randomUUID } from "node:crypto";
import {
  getEmiSpreadsheetId,
  getRawValuesFromSheet,
  batchUpdateCellsInSheet,
  ensureGridRowCountForSheet,
  deleteRowAtInSheet,
} from "./sheetsClient";

const TAB = "Heat Map";
const DATA_START_ROW = 6; // Row 6 is the first real data row (also has array formulas)
const LAST_COL = "S";     // Column S = index 18

const COL = {
  ID: 0,
  STATUS_NOTES: 1,
  NEXT_PAYMENT_DATE: 2,
  NAME: 3,
  MONTHLY_PAYMENT: 4,
  TRANSACTION_DATE: 5,
  PRINCIPAL: 6,
  TENURE_MONTHS: 7,
  FLAT_FEE: 8,
  INTEREST_PCT: 9,
  INTEREST_PER_MONTH: 10,
  TOTAL_INTEREST: 11,
  DISCOUNT_PER_MONTH: 12,
  PRINCIPAL_PER_MONTH: 13,
  STATUS: 14,
  WHATSAPP: 15,
  LATE_FEES: 16,
  REMAINING_MONTHS: 17,
  NOTES: 18,
} as const;

export type EmiLoanStatus = "Pending" | "Clear";

export interface EmiLoanRow {
  id: string;
  rowNumber: number;
  name: string;
  statusNotes: string;
  nextPaymentDate: string | null;
  monthlyPayment: number | null;
  transactionDate: string | null;
  principal: number;
  tenureMonths: number;
  flatFee: number | null;
  interestPct: number | null;
  interestPerMonth: number | null;
  totalInterest: number | null;
  discountPerMonth: number;
  principalPerMonth: number | null;
  status: EmiLoanStatus;
  whatsapp: string;
  lateFees: number | null;
  remainingMonths: number | null;
  notes: string;
}

export interface EmiLoanInput {
  name: string;
  transactionDate: string; // YYYY-MM-DD
  principal: number;
  tenureMonths: number;
  whatsapp?: string | null;
  discountPerMonth?: number | null;
  status?: EmiLoanStatus;
  statusNotes?: string | null;
  notes?: string | null;
}

export interface EmiLoanUpdate {
  name?: string;
  transactionDate?: string;
  principal?: number;
  tenureMonths?: number;
  whatsapp?: string | null;
  discountPerMonth?: number | null;
  status?: EmiLoanStatus;
  statusNotes?: string | null;
  notes?: string | null;
}

function colLetter(idx: number): string {
  return String.fromCharCode(65 + idx);
}

function serialToISODate(value: unknown): string | null {
  if (typeof value !== "number") return null;
  const ms = Math.round((value - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^\d.-]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

function toText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function parseRow(raw: unknown[], rowNumber: number): EmiLoanRow {
  const get = (idx: number) => raw[idx];
  return {
    id: toText(get(COL.ID)),
    rowNumber,
    name: toText(get(COL.NAME)),
    statusNotes: toText(get(COL.STATUS_NOTES)),
    nextPaymentDate: serialToISODate(get(COL.NEXT_PAYMENT_DATE)),
    monthlyPayment: toNumberOrNull(get(COL.MONTHLY_PAYMENT)),
    transactionDate: serialToISODate(get(COL.TRANSACTION_DATE)),
    principal: toNumberOrNull(get(COL.PRINCIPAL)) ?? 0,
    tenureMonths: toNumberOrNull(get(COL.TENURE_MONTHS)) ?? 0,
    flatFee: toNumberOrNull(get(COL.FLAT_FEE)),
    interestPct: toNumberOrNull(get(COL.INTEREST_PCT)),
    interestPerMonth: toNumberOrNull(get(COL.INTEREST_PER_MONTH)),
    totalInterest: toNumberOrNull(get(COL.TOTAL_INTEREST)),
    discountPerMonth: toNumberOrNull(get(COL.DISCOUNT_PER_MONTH)) ?? 0,
    principalPerMonth: toNumberOrNull(get(COL.PRINCIPAL_PER_MONTH)),
    status: (toText(get(COL.STATUS)) || "Pending") as EmiLoanStatus,
    whatsapp: toText(get(COL.WHATSAPP)),
    lateFees: toNumberOrNull(get(COL.LATE_FEES)),
    remainingMonths: toNumberOrNull(get(COL.REMAINING_MONTHS)),
    notes: toText(get(COL.NOTES)),
  };
}

export async function listEmiLoanRows(): Promise<EmiLoanRow[]> {
  const sheetId = getEmiSpreadsheetId();
  const raw = await getRawValuesFromSheet(sheetId, `${TAB}!A${DATA_START_ROW}:${LAST_COL}`);
  const rows: EmiLoanRow[] = [];
  const idBackfills: { range: string; values: (string | number)[][] }[] = [];

  raw.forEach((line, i) => {
    const rowNumber = DATA_START_ROW + i;
    const nameVal = toText(line[COL.NAME]);
    if (!nameVal) return; // skip empty rows

    let id = toText(line[COL.ID]);
    if (!id) {
      id = randomUUID();
      idBackfills.push({
        range: `${TAB}!${colLetter(COL.ID)}${rowNumber}`,
        values: [[id]],
      });
      (line as unknown[])[COL.ID] = id;
    }
    rows.push(parseRow(line, rowNumber));
  });

  if (idBackfills.length > 0) {
    const sheetId = getEmiSpreadsheetId();
    await batchUpdateCellsInSheet(sheetId, idBackfills);
  }

  return rows;
}

export async function getEmiLoanRow(id: string): Promise<EmiLoanRow | null> {
  const rows = await listEmiLoanRows();
  return rows.find((r) => r.id === id) ?? null;
}

async function getEmiLoanRowAtRowNumber(rowNumber: number): Promise<EmiLoanRow | null> {
  const sheetId = getEmiSpreadsheetId();
  const raw = await getRawValuesFromSheet(sheetId, `${TAB}!A${rowNumber}:${LAST_COL}${rowNumber}`);
  if (raw.length === 0) return null;
  return parseRow(raw[0], rowNumber);
}

async function findNextEmiRowNumber(): Promise<number> {
  const sheetId = getEmiSpreadsheetId();
  const nameColumn = await getRawValuesFromSheet(
    sheetId,
    `${TAB}!${colLetter(COL.NAME)}${DATA_START_ROW}:${colLetter(COL.NAME)}`,
  );
  // Find last non-empty row and go one beyond
  let lastNonEmpty = DATA_START_ROW - 1;
  nameColumn.forEach((row, i) => {
    if (row[0] && String(row[0]).trim()) {
      lastNonEmpty = DATA_START_ROW + i;
    }
  });
  return lastNonEmpty + 1;
}

function emiInputCellUpdates(
  rowNumber: number,
  input: Partial<EmiLoanInput & EmiLoanUpdate>,
): { range: string; values: (string | number)[][] }[] {
  const updates: { range: string; values: (string | number)[][] }[] = [];
  const set = (col: number, value: string | number | undefined | null) => {
    if (value === undefined) return;
    updates.push({
      range: `${TAB}!${colLetter(col)}${rowNumber}`,
      values: [[value ?? ""]],
    });
  };
  set(COL.STATUS_NOTES, input.statusNotes ?? undefined);
  set(COL.NAME, input.name);
  set(COL.TRANSACTION_DATE, input.transactionDate);
  set(COL.PRINCIPAL, input.principal);
  set(COL.TENURE_MONTHS, input.tenureMonths);
  set(COL.DISCOUNT_PER_MONTH, input.discountPerMonth ?? undefined);
  set(COL.STATUS, input.status);
  set(COL.WHATSAPP, input.whatsapp ?? undefined);
  set(COL.NOTES, input.notes ?? undefined);
  return updates;
}

export async function createEmiLoanRow(input: EmiLoanInput): Promise<EmiLoanRow> {
  const sheetId = getEmiSpreadsheetId();
  const rowNumber = await findNextEmiRowNumber();
  await ensureGridRowCountForSheet(sheetId, TAB, rowNumber);
  const id = randomUUID();
  const updates = [
    { range: `${TAB}!${colLetter(COL.ID)}${rowNumber}`, values: [[id]] },
    ...emiInputCellUpdates(rowNumber, { ...input, status: input.status ?? "Pending" }),
  ];
  await batchUpdateCellsInSheet(sheetId, updates);
  // Give sheets a moment to compute array-formula spill
  await new Promise((r) => setTimeout(r, 1000));
  const row = await getEmiLoanRowAtRowNumber(rowNumber);
  if (!row) throw new Error("Failed to read back newly created EMI loan row");
  return row;
}

export async function updateEmiLoanRow(
  id: string,
  patch: EmiLoanUpdate,
): Promise<EmiLoanRow | null> {
  const existing = await getEmiLoanRow(id);
  if (!existing) return null;
  const sheetId = getEmiSpreadsheetId();
  const updates = emiInputCellUpdates(existing.rowNumber, patch);
  if (updates.length > 0) {
    await batchUpdateCellsInSheet(sheetId, updates);
  }
  return getEmiLoanRowAtRowNumber(existing.rowNumber);
}

export async function deleteEmiLoanRow(id: string): Promise<EmiLoanRow | null> {
  const existing = await getEmiLoanRow(id);
  if (!existing) return null;
  const sheetId = getEmiSpreadsheetId();
  await deleteRowAtInSheet(sheetId, TAB, existing.rowNumber);
  return existing;
}
