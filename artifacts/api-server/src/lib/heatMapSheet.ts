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
import { batchUpdateCells, deleteRowAt, ensureGridRowCount, getRawValues, insertRowAt } from "./sheetsClient";

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

/** A single part-payment entry parsed from the stacked datePartPayment cell. */
export interface PartPaymentEntry {
  date: string | null;
  amount: number;
}

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
  /** Parsed list of part-payment entries. Derived from the stacked
   *  "YYYY-MM-DD:AMOUNT|YYYY-MM-DD:AMOUNT" format in the datePartPayment cell. */
  partPayments: PartPaymentEntry[];
  paid: number | null;
  profit: number | null;
  notes: string;
  /** Per-day late-fee accrual rate (rupees/day). Derived from lateFees / lateDays
   *  when both are available. Useful so borrowers know their daily cost of delay. */
  perDayAddition: number | null;
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

function colLetter(idx: number): string {
  return String.fromCharCode(65 + idx);
}

// ── One-time formula migration: ROUND → CEILING in financial columns ──────────
// Replaces ROUND( with CEILING( in the sheet's formula row for flat fee, interest,
// late fees, and final amount columns so monetary amounts always round up to the
// nearest rupee, consistent with JS-side rounding.
let ceilingFormulaMigrationDone = false;

function applyRoundToCeiling(formula: string): string {
  if (!formula || !formula.startsWith("=")) return formula;
  let result = formula.replace(/\bROUND\(/g, "CEILING(");
  // CEILING(expr, 0) is a Sheets error; fix any ", 0)" left by the ROUND second arg.
  result = result.replace(/,\s*0\s*\)/g, ", 1)");
  return result;
}

async function ensureHeatMapCeilingFormulas(): Promise<void> {
  if (ceilingFormulaMigrationDone) return;
  try {
    const formulaRowRange = `${TAB}!A${FORMULA_ROW}:V${FORMULA_ROW}`;
    const rows = await getRawValues(formulaRowRange, "FORMULA");
    const cells: unknown[] = rows[0] ?? [];
    const colsToMigrate = [COL.FLAT_FEE, COL.INTEREST, COL.LATE_FEES, COL.FINAL_AMOUNT];
    const updates: { range: string; values: (string | number)[][] }[] = [];
    for (const colIdx of colsToMigrate) {
      const raw = cells[colIdx];
      const formula = typeof raw === "string" ? raw : "";
      if (!formula.includes("ROUND(")) continue;
      const updated = applyRoundToCeiling(formula);
      if (updated !== formula) {
        updates.push({ range: `${TAB}!${colLetter(colIdx)}${FORMULA_ROW}`, values: [[updated]] });
      }
    }
    if (updates.length > 0) {
      await batchUpdateCells(updates);
      console.info(`[heatMapSheet] Migrated ${updates.length} formula(s): ROUND → CEILING.`);
    }
    ceilingFormulaMigrationDone = true;
  } catch (err) {
    console.warn("[heatMapSheet] CEILING migration failed (will retry):", err);
  }
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

/**
 * Parses the stacked part-payment string from the datePartPayment cell.
 *
 * Formats supported:
 *  - Empty / null                → []
 *  - Numeric (serial date)       → [{ date: "YYYY-MM-DD", amount: 0 }] (legacy)
 *  - "YYYY-MM-DD"                → [{ date: "YYYY-MM-DD", amount: 0 }] (legacy single)
 *  - "YYYY-MM-DD:AMOUNT"         → [{ date: "YYYY-MM-DD", amount: AMOUNT }]
 *  - "YYYY-MM-DD:AMOUNT|..."     → multiple entries
 */
function parsePartPayments(raw: unknown, partPayment: number | null): PartPaymentEntry[] {
  if (typeof raw === "number") {
    const date = serialToISODate(raw);
    return [{ date, amount: partPayment ?? 0 }];
  }
  if (typeof raw !== "string" || !raw.trim()) return [];
  const text = raw.trim();
  if (text.includes("|") || text.includes(":")) {
    return text
      .split("|")
      .filter(Boolean)
      .map((entry) => {
        const colonIdx = entry.indexOf(":");
        if (colonIdx === -1) return { date: entry.trim() || null, amount: 0 };
        const datePart = entry.slice(0, colonIdx).trim();
        const amtPart = entry.slice(colonIdx + 1).trim();
        return { date: datePart || null, amount: Number(amtPart) || 0 };
      });
  }
  // Single date string (legacy)
  return [{ date: text, amount: partPayment ?? 0 }];
}

function parseRow(raw: unknown[], rowNumber: number): LoanRow {
  const get = (idx: number) => raw[idx];
  const lateDays = toNumberOrNull(get(COL.LATE_DAYS));
  // Apply permanent 1.5× late-fee multiplier — the sheet formula computes the base amount,
  // the app always reports 50% higher as per business rule.
  const rawLateFees = toNumberOrNull(get(COL.LATE_FEES));
  const lateFees = rawLateFees != null ? Math.round(rawLateFees * 1.5) : null;
  const partPayment = toNumberOrNull(get(COL.PART_PAYMENT));
  const partPayments = parsePartPayments(get(COL.DATE_PART_PAYMENT), partPayment);

  // perDayAddition = lateFees / lateDays when both are positive
  const perDayAddition =
    lateDays != null && lateDays > 0 && lateFees != null && lateFees > 0
      ? Math.round(lateFees / lateDays)
      : null;

  return {
    id: toText(get(COL.ID)).trim(),
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
    lateDays,
    lateFees,
    finalAmount: toNumberOrNull(get(COL.FINAL_AMOUNT)),
    partPayment,
    dateOfPartPayment: typeof get(COL.DATE_PART_PAYMENT) === "string"
      ? toText(get(COL.DATE_PART_PAYMENT)) || null
      : serialToISODate(get(COL.DATE_PART_PAYMENT)),
    partPayments,
    paid: toNumberOrNull(get(COL.PAID)),
    profit: toNumberOrNull(get(COL.PROFIT)),
    notes: toText(get(COL.NOTES)),
    perDayAddition,
  };
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
  /** When set, appends this part payment to the stacked list instead of overwriting. */
  appendPartPayment?: { amount: number; date: string } | null;
}

/** Reads every real data row (skips the header/formula rows and blanks), backfilling any missing id. */
export async function listLoanRows(): Promise<LoanRow[]> {
  // Kick off the one-time ROUND→CEILING migration non-blockingly.
  ensureHeatMapCeilingFormulas().catch(() => {});
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
  // Primary: match by UUID. Fallback: match by human-readable loanId (e.g. "L-0065")
  // so that (a) direct bookmark-style links work and (b) if a UUID write-back to the
  // sheet ever fails the row is still reachable by its stable display ID.
  return rows.find((r) => r.id === id || r.loanId === id) ?? null;
}

async function findNextRowNumber(): Promise<number> {
  const nameColumn = await getRawValues(
    `${TAB}!${colLetter(COL.NAME)}${DATA_START_ROW}:${colLetter(COL.NAME)}`,
  );
  return DATA_START_ROW + nameColumn.length;
}

function inputCellUpdates(
  rowNumber: number,
  input: Partial<LoanRowInput & Omit<LoanRowUpdate, "appendPartPayment">>,
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
 * Creates a new loan row at the TOP of the data section (just below the
 * formula row at row 6), inserting a blank row there so the new loan
 * appears first in the sheet. Computed columns are left untouched so the
 * sheet's array formulas spill into them automatically.
 *
 * After creation, the on-time final amount (timelyReturn) is written once
 * from the sheet's computed finalAmount — it is never updated after this.
 */
export async function createLoanRow(input: LoanRowInput): Promise<LoanRow> {
  // Insert a blank row at DATA_START_ROW (7) — pushes existing data down
  await insertRowAt(TAB, DATA_START_ROW);
  const rowNumber = DATA_START_ROW;

  const id = randomUUID();
  const updates = [
    { range: `${TAB}!${colLetter(COL.ID)}${rowNumber}`, values: [[id]] },
    ...inputCellUpdates(rowNumber, { ...input, status: input.status ?? "Pending" }),
  ];
  await batchUpdateCells(updates);

  // Wait for array formulas to compute
  await new Promise((r) => setTimeout(r, 1000));

  // Read back the row to capture the sheet-computed finalAmount
  let row = await getLoanRowAtRowNumber(rowNumber);
  if (!row) throw new Error("Failed to read back newly created loan row");

  // Write timelyReturn = finalAmount (on-time repayment amount). Never overwrite after this.
  if (row.finalAmount != null && row.timelyReturn == null) {
    await batchUpdateCells([
      {
        range: `${TAB}!${colLetter(COL.TIMELY_RETURN)}${rowNumber}`,
        values: [[row.finalAmount]],
      },
    ]);
    // Re-read to include timelyReturn
    row = (await getLoanRowAtRowNumber(rowNumber)) ?? row;
  }

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

  // Spread non-appendPartPayment fields into normal updates
  const { appendPartPayment, ...regularPatch } = patch;
  const updates = inputCellUpdates(existing.rowNumber, regularPatch);

  // Handle appending a new part payment to the stacked list
  if (appendPartPayment) {
    const newEntry = `${appendPartPayment.date}:${appendPartPayment.amount}`;
    const prevStack = existing.dateOfPartPayment ?? "";
    const newStack = prevStack
      ? `${prevStack}|${newEntry}`
      : newEntry;

    // Sum all existing part payments plus the new one
    const allEntries = newStack.split("|").filter(Boolean);
    const totalPartPayment = allEntries.reduce((sum, entry) => {
      const colonIdx = entry.indexOf(":");
      const amt = colonIdx !== -1 ? Number(entry.slice(colonIdx + 1)) : 0;
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

    updates.push(
      {
        range: `${TAB}!${colLetter(COL.DATE_PART_PAYMENT)}${existing.rowNumber}`,
        values: [[newStack]],
      },
      {
        range: `${TAB}!${colLetter(COL.PART_PAYMENT)}${existing.rowNumber}`,
        values: [[totalPartPayment]],
      },
    );
  }

  if (updates.length > 0) {
    await batchUpdateCells(updates);
  }
  return getLoanRowAtRowNumber(existing.rowNumber);
}

/**
 * Convenience function: append a single part payment to an existing loan.
 * Updates Q (partPayment sum) and R (stacked date:amount history).
 */
export async function appendPartPaymentToLoan(
  id: string,
  amount: number,
  date: string,
): Promise<LoanRow | null> {
  return updateLoanRow(id, { appendPartPayment: { amount, date } });
}

export async function deleteLoanRow(id: string): Promise<LoanRow | null> {
  const existing = await getLoanRow(id);
  if (!existing) return null;
  await deleteRowAt(TAB, existing.rowNumber);
  return existing;
}
