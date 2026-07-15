/**
 * Typed access to the user's real lending ledger: the "Heat Map" tab of their
 * existing spreadsheet. This tab already contains hand-built spreadsheet
 * formulas (tiered flat fee, interest %, interest, late fees, final amount,
 * profit) anchored on row 6 as array formulas (MAP/ARRAYFORMULA) that spill
 * down over every data row. We never recompute any of that math ourselves —
 * we only read the computed columns and write the input columns, exactly as
 * instructed: "everything is being calculated in the sheet itself."
 *
 * Layout (1-indexed sheet rows):
 *  - Row 5: header labels
 *  - Row 6: the "Formula row" — holds the master array formulas. NEVER touch
 *    this row (delete/overwrite would break every computed column below it).
 *  - Row 7+: data rows.
 *
 * Column map (0-indexed):
 *  A(0)  id                 - our own bookkeeping UUID (sheet has an unused
 *                             blank column here; no formula references it)
 *  B(1)  returnDate         - COMPUTED
 *  C(2)  name               - input
 *  D(3)  timelyReturn       - legacy manual field, kept for reference only
 *  E(4)  transactionDate    - input (date)
 *  F(5)  principal          - input
 *  G(6)  tenureDays         - input
 *  H(7)  whatsapp           - input (phone, sometimes with free-form notes)
 *  I(8)  status             - input ("Pending" | "Clear" | "Temp" | "Archived")
 *  J(9)  flatFee            - COMPUTED
 *  K(10) interestPct        - COMPUTED
 *  L(11) interest           - COMPUTED
 *  M(12) discountOrCharges  - input (negative = discount, positive = charge)
 *  N(13) lateDays           - COMPUTED
 *  O(14) lateFees           - COMPUTED
 *  P(15) finalAmount        - COMPUTED (authoritative amount to collect)
 *  Q(16) partPayment        - input
 *  R(17) datePartPayment    - input (date)
 *  S(18) paid               - input (total amount actually collected)
 *  T(19) profit             - COMPUTED
 *  U(20) (spacer, unused)
 *  V(21) notes              - input
 */
import { randomUUID } from "node:crypto";
import { batchUpdateCells, ensureGridRowCount, getRawValues } from "./sheetsClient";

const TAB = "Heat Map";
const HEADER_ROW = 5;
const FORMULA_ROW = 6;
const DATA_START_ROW = 7;
const LAST_COL_INDEX = 21; // V

const COL = {
  ID: 0,
  RETURN_DATE: 1,
  NAME: 2,
  TIMELY_RETURN: 3,
  TRANSACTION_DATE: 4,
  PRINCIPAL: 5,
  TENURE_DAYS: 6,
  WHATSAPP: 7,
  STATUS: 8,
  FLAT_FEE: 9,
  INTEREST_PCT: 10,
  INTEREST: 11,
  DISCOUNT_OR_CHARGES: 12,
  LATE_DAYS: 13,
  LATE_FEES: 14,
  FINAL_AMOUNT: 15,
  PART_PAYMENT: 16,
  DATE_PART_PAYMENT: 17,
  PAID: 18,
  PROFIT: 19,
  NOTES: 21,
} as const;

export type LoanStatus = "Pending" | "Clear" | "Temp" | "Archived";

export interface LoanRow {
  id: string;
  /** Human-readable loan ID derived from the sheet row (e.g. "L-0001").
   *  DATA_START_ROW (7) → "L-0001", row 8 → "L-0002", etc.
   *  Stable as long as the row is not deleted. */
  loanId: string;
  rowNumber: number;
  name: string;
  returnDate: string | null;
  timelyReturn: number | null;
  transactionDate: string | null;
  principal: number;
  tenureDays: number;
  whatsapp: string;
  status: LoanStatus;
  flatFee: number | null;
  interestPct: number | null;
  interest: number | null;
  discountOrCharges: number;
  lateDays: number | null;
  lateFees: number | null;
  finalAmount: number | null;
  partPayment: number | null;
  dateOfPartPayment: string | null;
  paid: number | null;
  profit: number | null;
  notes: string;
}

export interface LoanRowInput {
  name: string;
  transactionDate: string; // YYYY-MM-DD
  principal: number;
  tenureDays: number;
  whatsapp?: string | null;
  status?: LoanStatus;
  discountOrCharges?: number | null;
  notes?: string | null;
}

export interface LoanRowUpdate {
  name?: string;
  transactionDate?: string;
  principal?: number;
  tenureDays?: number;
  whatsapp?: string | null;
  status?: LoanStatus;
  discountOrCharges?: number | null;
  partPayment?: number | null;
  dateOfPartPayment?: string | null;
  paid?: number | null;
  notes?: string | null;
}

function colLetter(idx: number): string {
  return String.fromCharCode(65 + idx);
}

/** Google Sheets/Excel serial date (days since 1899-12-30) -> "YYYY-MM-DD". */
function serialToISODate(value: unknown): string | null {
  if (typeof value !== "number") return null;
  const ms = Math.round((value - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function toText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

/** Converts a 1-based data row number to a human-readable loan ID: "L-0001", "L-0002", … */
function makeLoanId(rowNumber: number): string {
  const seq = rowNumber - DATA_START_ROW + 1; // row 7 → 1, row 8 → 2, …
  return `L-${String(seq).padStart(4, "0")}`;
}

function parseRow(raw: unknown[], rowNumber: number): LoanRow {
  const get = (idx: number) => raw[idx];
  return {
    id: toText(get(COL.ID)),
    loanId: makeLoanId(rowNumber),
    rowNumber,
    name: toText(get(COL.NAME)),
    returnDate: serialToISODate(get(COL.RETURN_DATE)),
    timelyReturn: toNumberOrNull(get(COL.TIMELY_RETURN)),
    transactionDate: serialToISODate(get(COL.TRANSACTION_DATE)),
    principal: toNumberOrNull(get(COL.PRINCIPAL)) ?? 0,
    tenureDays: toNumberOrNull(get(COL.TENURE_DAYS)) ?? 0,
    whatsapp: toText(get(COL.WHATSAPP)),
    status: (toText(get(COL.STATUS)) || "Pending") as LoanStatus,
    flatFee: toNumberOrNull(get(COL.FLAT_FEE)),
    interestPct: toNumberOrNull(get(COL.INTEREST_PCT)),
    interest: toNumberOrNull(get(COL.INTEREST)),
    discountOrCharges: toNumberOrNull(get(COL.DISCOUNT_OR_CHARGES)) ?? 0,
    lateDays: toNumberOrNull(get(COL.LATE_DAYS)),
    lateFees: toNumberOrNull(get(COL.LATE_FEES)),
    finalAmount: toNumberOrNull(get(COL.FINAL_AMOUNT)),
    partPayment: toNumberOrNull(get(COL.PART_PAYMENT)),
    dateOfPartPayment: serialToISODate(get(COL.DATE_PART_PAYMENT)),
    paid: toNumberOrNull(get(COL.PAID)),
    profit: toNumberOrNull(get(COL.PROFIT)),
    notes: toText(get(COL.NOTES)),
  };
}

/** Reads every real data row (skips the header/formula rows and blanks), backfilling any missing id. */
export async function listLoanRows(): Promise<LoanRow[]> {
  const raw = await getRawValues(`${TAB}!A${DATA_START_ROW}:V`);
  const rows: LoanRow[] = [];
  const idBackfills: { range: string; values: (string | number)[][] }[] = [];

  raw.forEach((line, i) => {
    const rowNumber = DATA_START_ROW + i;
    if (rowNumber === FORMULA_ROW) return;
    const nameVal = toText(line[COL.NAME]);
    if (!nameVal || nameVal.toLowerCase() === "formula row") return;

    let id = toText(line[COL.ID]);
    if (!id) {
      id = randomUUID();
      idBackfills.push({
        range: `${TAB}!${colLetter(COL.ID)}${rowNumber}`,
        values: [[id]],
      });
      line[COL.ID] = id;
    }
    rows.push(parseRow(line, rowNumber));
  });

  if (idBackfills.length > 0) {
    await batchUpdateCells(idBackfills);
  }

  return rows;
}

export async function getLoanRow(id: string): Promise<LoanRow | null> {
  const rows = await listLoanRows();
  return rows.find((r) => r.id === id) ?? null;
}

async function findNextRowNumber(): Promise<number> {
  const nameColumn = await getRawValues(
    `${TAB}!${colLetter(COL.NAME)}${DATA_START_ROW}:${colLetter(COL.NAME)}`,
  );
  return DATA_START_ROW + nameColumn.length;
}

function inputCellUpdates(
  rowNumber: number,
  input: Partial<LoanRowInput & LoanRowUpdate>,
): { range: string; values: (string | number)[][] }[] {
  const updates: { range: string; values: (string | number)[][] }[] = [];
  const set = (col: number, value: string | number | undefined | null) => {
    if (value === undefined) return;
    updates.push({
      range: `${TAB}!${colLetter(col)}${rowNumber}`,
      values: [[value ?? ""]],
    });
  };
  set(COL.NAME, input.name);
  set(COL.TRANSACTION_DATE, input.transactionDate);
  set(COL.PRINCIPAL, input.principal);
  set(COL.TENURE_DAYS, input.tenureDays);
  set(COL.WHATSAPP, input.whatsapp ?? undefined);
  set(COL.STATUS, input.status);
  set(COL.DISCOUNT_OR_CHARGES, input.discountOrCharges ?? undefined);
  set(COL.NOTES, input.notes ?? undefined);
  if ("partPayment" in input) set(COL.PART_PAYMENT, input.partPayment ?? undefined);
  if ("dateOfPartPayment" in input)
    set(COL.DATE_PART_PAYMENT, input.dateOfPartPayment ?? undefined);
  if ("paid" in input) set(COL.PAID, input.paid ?? undefined);
  return updates;
}

/**
 * Appends a new loan row, writing only input columns. Computed columns
 * (Return Date, Flat Fee, Interest %, Interest, Late days/fees, Final
 * Amount, Profit) are left completely untouched so the sheet's own array
 * formulas spill into them automatically.
 */
export async function createLoanRow(input: LoanRowInput): Promise<LoanRow> {
  const rowNumber = await findNextRowNumber();
  await ensureGridRowCount(TAB, rowNumber);
  const id = randomUUID();
  const updates = [
    { range: `${TAB}!${colLetter(COL.ID)}${rowNumber}`, values: [[id]] },
    ...inputCellUpdates(rowNumber, { ...input, status: input.status ?? "Pending" }),
  ];
  await batchUpdateCells(updates);
  const row = await getLoanRowAtRowNumber(rowNumber);
  if (!row) throw new Error("Failed to read back newly created loan row");
  return row;
}

async function getLoanRowAtRowNumber(rowNumber: number): Promise<LoanRow | null> {
  const raw = await getRawValues(`${TAB}!A${rowNumber}:V${rowNumber}`);
  if (raw.length === 0) return null;
  return parseRow(raw[0], rowNumber);
}

export async function updateLoanRow(
  id: string,
  patch: LoanRowUpdate,
): Promise<LoanRow | null> {
  const existing = await getLoanRow(id);
  if (!existing) return null;
  const updates = inputCellUpdates(existing.rowNumber, patch);
  if (updates.length > 0) {
    await batchUpdateCells(updates);
  }
  return getLoanRowAtRowNumber(existing.rowNumber);
}

export async function deleteLoanRow(id: string): Promise<LoanRow | null> {
  const existing = await getLoanRow(id);
  if (!existing) return null;
  const { deleteRowAt } = await import("./sheetsClient");
  await deleteRowAt(TAB, existing.rowNumber);
  return existing;
}
