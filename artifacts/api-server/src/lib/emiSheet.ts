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
 *  R(17) remainingMonths     — server-managed input (decremented each month)
 *  S(18) notes               — input
 *  T(19) paidDates           — pipe-separated "YYYY-MM-DD:amount" payment history (server-managed)
 *  U(20) dailyAmount         — optional custom daily instalment override (default: monthlyPayment ÷ 30)
 *  V(21) weeklyAmount        — optional custom weekly instalment override (default: monthlyPayment × 7 ÷ 30)
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
const LAST_COL = "W";     // Column W = index 22

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
  PAID_DATES: 19,
  DAILY_AMOUNT: 20,
  WEEKLY_AMOUNT: 21,
  BIMONTHLY_AMOUNT: 22,
} as const;

export type EmiLoanStatus = "Pending" | "Clear";

export interface EmiLoanRow {
  id: string;
  /** Human-readable EMI loan ID derived from the sheet row (e.g. "E-0001").
   *  DATA_START_ROW (6) → "E-0001", row 7 → "E-0002", etc.
   *  Stable as long as the row is not deleted. */
  emiId: string;
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
  /** Computed by the sheet's ARRAYFORMULA in column Q: daily interest accrual on overdue EMIs. */
  lateFees: number | null;
  remainingMonths: number | null;
  notes: string;
  /** Server-computed: calendar days overdue (nextPaymentDate is in the past and status=Pending).
   *  0 when on time or already cleared. */
  lateDays: number;
  /** Pipe-separated payment history entries: "YYYY-MM-DD:amount" or "YYYY-MM-DD". */
  paidDates: string[];
  /** Optional custom daily instalment override. When null, UI falls back to monthlyPayment ÷ 30. */
  dailyAmount: number | null;
  /** Optional custom weekly instalment override. When null, UI falls back to monthlyPayment × 7 ÷ 30. */
  weeklyAmount: number | null;
  /** Optional custom bimonthly (twice-a-month) instalment override. When null, UI falls back to monthlyPayment ÷ 2. */
  bimonthlyAmount: number | null;
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
  /** Override initial nextPaymentDate (defaults to transactionDate + 1 month). */
  nextPaymentDate?: string | null;
  /** Optional custom bimonthly instalment override. */
  bimonthlyAmount?: number | null;
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
  /** Server-managed: ISO date of next monthly payment due. Written as Sheets serial. */
  nextPaymentDate?: string | null;
  /** Server-managed: how many months remain in the EMI tenure. */
  remainingMonths?: number | null;
  /** Optional custom daily instalment override. null clears it (falls back to monthlyPayment ÷ 30). */
  dailyAmount?: number | null;
  /** Optional custom weekly instalment override. null clears it (falls back to monthlyPayment × 7 ÷ 30). */
  weeklyAmount?: number | null;
  /** Optional custom bimonthly instalment override. null clears it (falls back to monthlyPayment ÷ 2). */
  bimonthlyAmount?: number | null;
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

/** Converts a 1-based data row number to a human-readable EMI loan ID: "E-0001", "E-0002", … */
function makeEmiId(rowNumber: number): string {
  const seq = rowNumber - DATA_START_ROW + 1; // row 6 → 1, row 7 → 2, …
  return `E-${String(seq).padStart(4, "0")}`;
}

/**
 * Google Sheets serial date epoch offset — sheets counts days from 1899-12-30,
 * Unix epoch is 1970-01-01, so today-as-serial = floor(Date.now()/86400000) + 25569.
 */
const SHEET_EPOCH_OFFSET = 25569;

function todaySerial(): number {
  // Use IST (UTC+5:30) so the day flips at midnight IST, not midnight UTC.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 19 800 000 ms
  return Math.floor((Date.now() + IST_OFFSET_MS) / 86400000) + SHEET_EPOCH_OFFSET;
}

/** Converts an ISO date string "YYYY-MM-DD" to a Google Sheets serial number. */
function isoToSerial(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 86400000) + SHEET_EPOCH_OFFSET;
}

/** Advances an ISO date by exactly one calendar month, clamping to month-end on overflow (e.g. Jan 31 → Feb 28/29). */
function advanceOneMonth(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const origDay = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + 1);
  if (d.getUTCDate() < origDay) d.setUTCDate(0); // clamp to last day of intended month
  return d.toISOString().slice(0, 10);
}

/**
 * Computes the server-side next payment due date from remainingMonths and transactionDate.
 * This avoids relying on the sheet's C-column formula (which auto-advances based on TODAY()
 * and cannot detect overdue payments reliably).
 *
 * Formula: nextDue = transactionDate + (tenureMonths - remainingMonths + 1) months
 */
function computeNextDueDate(
  transactionDate: string | null,
  tenureMonths: number,
  remainingMonths: number | null,
): string | null {
  if (!transactionDate || remainingMonths === null || remainingMonths <= 0) return null;
  const paidMonths = Math.max(tenureMonths - remainingMonths, 0);
  const d = new Date(transactionDate + "T00:00:00Z");
  const origDay = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + paidMonths + 1);
  // Clamp: e.g. Jan 31 + 1 month → Feb 28/29
  if (d.getUTCDate() < origDay) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/**
 * Counts how many monthly due dates (txDate + 1m, +2m, ...) have passed as of today.
 * This is the maximum number of months that could legitimately have been paid.
 * Used as a safety cap to prevent over-decrement caused by duplicate API calls or
 * partial-payment amounts that inadvertently exceed the monthly target.
 */
function computeMaxPaidMonths(transactionDate: string, tenureMonths: number): number {
  const today = todaySerial();
  let count = 0;
  for (let n = 1; n <= tenureMonths; n++) {
    const d = new Date(transactionDate + "T00:00:00Z");
    const origDay = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + n);
    if (d.getUTCDate() < origDay) d.setUTCDate(0);
    if (isoToSerial(d.toISOString().slice(0, 10)) <= today) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function parseRow(raw: unknown[], rowNumber: number): EmiLoanRow {
  const get = (idx: number) => raw[idx];
  const status = (toText(get(COL.STATUS)) || "Pending") as EmiLoanStatus;
  const remainingMonths = toNumberOrNull(get(COL.REMAINING_MONTHS));
  const tenureMonths = toNumberOrNull(get(COL.TENURE_MONTHS)) ?? 0;
  const transactionDate = serialToISODate(get(COL.TRANSACTION_DATE));
  const monthlyPayVal = toNumberOrNull(get(COL.MONTHLY_PAYMENT));

  // Retroactively credit D/W partial entries that add up to one or more full months.
  // This corrects entries recorded before the auto-close guard was removed: those
  // entries have type "W"/"D" but their accumulated sum may already cover ≥1 month.
  let effectiveRemaining = remainingMonths;
  const paidDatesRaw = toText(get(COL.PAID_DATES)).split("|").map(s => s.trim()).filter(Boolean);
  if (effectiveRemaining !== null && monthlyPayVal !== null && monthlyPayVal > 0) {
    // Locate cycle start: date of last month-completing entry (M / DM / WM / BMM)
    let cycleStartDate = "";
    for (let i = paidDatesRaw.length - 1; i >= 0; i--) {
      const parts = paidDatesRaw[i].split(":");
      const type = parts[2] ?? "M";
      if (type === "M" || type === "DM" || type === "WM" || type === "BMM") {
        cycleStartDate = parts[0] ?? "";
        break;
      }
    }
    // Sum D/W/BM amounts after cycle start
    const cycleAccumulated = paidDatesRaw.reduce((sum, e) => {
      const parts = e.split(":");
      const eDate = parts[0] ?? "";
      const amt = parseFloat(parts[1] ?? "0") || 0;
      const type = parts[2] ?? "M";
      if ((type === "D" || type === "W" || type === "BM") && eDate > cycleStartDate) return sum + amt;
      return sum;
    }, 0);
    const extraMonths = Math.floor(cycleAccumulated / monthlyPayVal);
    if (extraMonths > 0) {
      effectiveRemaining = Math.max(effectiveRemaining - extraMonths, 0);
    }
  }

  // Safety cap on effectiveRemaining: the number of months "paid" can never exceed the
  // count of monthly due dates that have actually passed (transactionDate + n months ≤ today).
  // This prevents display bugs when remainingMonths is wrong due to over-decrement
  // (e.g. each weekly payment ≥ monthlyPayment triggered a false WM, or partial entries
  // accumulated retroactively past what's chronologically possible).
  if (transactionDate && effectiveRemaining !== null) {
    const maxPaid = computeMaxPaidMonths(transactionDate, tenureMonths);
    const minRemaining = Math.max(tenureMonths - maxPaid, 0);
    if (effectiveRemaining < minRemaining) {
      effectiveRemaining = minRemaining;
    }
  }

  // Compute next payment date using effective remaining (accounts for retroactive credits).
  const nextPaymentDate = computeNextDueDate(transactionDate, tenureMonths, effectiveRemaining);

  const today = todaySerial();
  const nextPaySerial = nextPaymentDate ? isoToSerial(nextPaymentDate) : null;

  // Overdue = Pending, has remaining months, and effective next-due date is in the past.
  const lateDays =
    status === "Pending" &&
    nextPaySerial !== null &&
    effectiveRemaining !== null &&
    effectiveRemaining > 0 &&
    nextPaySerial < today
      ? Math.floor(today - nextPaySerial)
      : 0;

  // Compute late fees server-side: 1% per day on effective payment amount × days overdue.
  // This overrides the sheet ARRAYFORMULA (which uses interestPerMonth — too high) and
  // ensures the app always shows: payment × 0.01 × lateDays as the late penalty.
  // Priority: weeklyAmount > dailyAmount > monthlyPayment.
  const weeklyAmountVal = toNumberOrNull(get(COL.WEEKLY_AMOUNT));
  const dailyAmountVal  = toNumberOrNull(get(COL.DAILY_AMOUNT));
  const effectivePmt    = weeklyAmountVal ?? dailyAmountVal ?? monthlyPayVal;
  const lateFees =
    effectivePmt != null && effectivePmt > 0 && lateDays > 0
      ? Math.round(effectivePmt * 0.01 * lateDays)
      : 0;

  return {
    id: toText(get(COL.ID)),
    emiId: makeEmiId(rowNumber),
    rowNumber,
    name: toText(get(COL.NAME)),
    statusNotes: toText(get(COL.STATUS_NOTES)),
    nextPaymentDate,
    monthlyPayment: monthlyPayVal,
    transactionDate,
    principal: toNumberOrNull(get(COL.PRINCIPAL)) ?? 0,
    tenureMonths: toNumberOrNull(get(COL.TENURE_MONTHS)) ?? 0,
    flatFee: toNumberOrNull(get(COL.FLAT_FEE)),
    interestPct: toNumberOrNull(get(COL.INTEREST_PCT)),
    interestPerMonth: toNumberOrNull(get(COL.INTEREST_PER_MONTH)),
    totalInterest: toNumberOrNull(get(COL.TOTAL_INTEREST)),
    discountPerMonth: toNumberOrNull(get(COL.DISCOUNT_PER_MONTH)) ?? 0,
    principalPerMonth: toNumberOrNull(get(COL.PRINCIPAL_PER_MONTH)),
    status,
    whatsapp: toText(get(COL.WHATSAPP)),
    lateFees,
    remainingMonths,
    notes: toText(get(COL.NOTES)),
    lateDays,
    paidDates: toText(get(COL.PAID_DATES))
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean),
    dailyAmount: dailyAmountVal,
    weeklyAmount: weeklyAmountVal,
    bimonthlyAmount: toNumberOrNull(get(COL.BIMONTHLY_AMOUNT)),
  };
}

/**
 * Writes the late-fees ARRAYFORMULA to column Q of the EMI Heat Map tab.
 *
 * Formula: lateFees = overdueDays × (interestPerMonth / 30)
 *   — only for Pending rows with a past nextPaymentDate and remaining months.
 *
 * Uses the same column positions the sheet already defines:
 *   C = nextPaymentDate (serial), D = name, K = interestPerMonth,
 *   O = status, R = remainingMonths, Q = lateFees (target).
 */
let lateFeesFormulaWritten = false;

async function ensureEmiLateFeesFormula(): Promise<void> {
  if (lateFeesFormulaWritten) return;
  try {
    const sheetId = getEmiSpreadsheetId();
    const targetCell = `${TAB}!${colLetter(COL.LATE_FEES)}${DATA_START_ROW}`;
    // Read current formula in the cell (FORMULA render mode) to skip if already set
    const existing = await getRawValuesFromSheet(sheetId, targetCell, "FORMULA");
    const currentFormula = toText(existing?.[0]?.[0]);
    // Check if formula is already written AND includes the 1.5× multiplier
    if (currentFormula.startsWith("=ARRAYFORMULA") && currentFormula.includes("*1.5")) {
      lateFeesFormulaWritten = true;
      return;
    }
    // Write the ARRAYFORMULA. Conditions (all must be true for a non-zero result):
    //   D6:D <> ""             → row has a borrower name
    //   O6:O = "Pending"       → loan is not yet cleared
    //   ISNUMBER(C6:C)         → nextPaymentDate is a real date serial
    //   C6:C < TODAY()         → payment was due in the past (overdue)
    //   ISNUMBER(R6:R)         → remainingMonths is computed
    //   R6:R > 0               → loan not fully repaid
    // Value: FLOOR(TODAY()-C) = integer overdue days, ×K/30×1.5 = daily interest accrual (+50% late fee)
    const formula =
      `=ARRAYFORMULA(IF(` +
      `(D${DATA_START_ROW}:D<>"")*(O${DATA_START_ROW}:O="Pending")` +
      `*(ISNUMBER(C${DATA_START_ROW}:C))*(C${DATA_START_ROW}:C<TODAY())` +
      `*(ISNUMBER(R${DATA_START_ROW}:R))*(R${DATA_START_ROW}:R>0),` +
      `FLOOR(TODAY()-C${DATA_START_ROW}:C)*IFERROR(K${DATA_START_ROW}:K,0)/30*1.5,` +
      `0))`;
    await batchUpdateCellsInSheet(sheetId, [{ range: targetCell, values: [[formula]] }]);
    lateFeesFormulaWritten = true;
  } catch (err) {
    // Non-fatal: server still works, late fees just won't be in the sheet
    console.warn("[emiSheet] Failed to write late-fees formula:", err);
  }
}

export async function listEmiLoanRows(): Promise<EmiLoanRow[]> {
  // Ensure the late-fees ARRAYFORMULA is in place (runs once per process, non-blocking).
  ensureEmiLateFeesFormula().catch(() => {});
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
  // Custom quick-pay override amounts (null = clear back to computed default)
  if (input.dailyAmount !== undefined) set(COL.DAILY_AMOUNT, input.dailyAmount ?? "");
  if (input.weeklyAmount !== undefined) set(COL.WEEKLY_AMOUNT, input.weeklyAmount ?? "");
  if (input.bimonthlyAmount !== undefined) set(COL.BIMONTHLY_AMOUNT, input.bimonthlyAmount ?? "");

  // Server-managed tracking columns
  if (input.nextPaymentDate !== undefined) {
    const serial = input.nextPaymentDate ? isoToSerial(input.nextPaymentDate) : "";
    updates.push({ range: `${TAB}!${colLetter(COL.NEXT_PAYMENT_DATE)}${rowNumber}`, values: [[serial]] });
  }
  if (input.remainingMonths !== undefined) {
    updates.push({ range: `${TAB}!${colLetter(COL.REMAINING_MONTHS)}${rowNumber}`, values: [[input.remainingMonths ?? ""]] });
  }

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
  // Write initial server-managed tracking columns.
  // Column C (NEXT_PAYMENT_DATE) is managed by the sheet's ARRAYFORMULA — do NOT write to it.
  // Column R (remainingMonths) is the canonical payment counter, initialised to tenureMonths.
  updates.push(
    { range: `${TAB}!${colLetter(COL.REMAINING_MONTHS)}${rowNumber}`, values: [[Number(input.tenureMonths)]] },
  );

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

// ─── paidDates entry format ────────────────────────────────────────────────────
// Each entry: "YYYY-MM-DD:amount:type"
//   type = "M"   → monthly full payment (decrements remainingMonths)
//   type = "D"   → daily partial (no decrement)
//   type = "W"   → weekly partial (no decrement)
//   type = "BM"  → bimonthly partial (no decrement)
//   type = "DM"  → daily partial that completed the month (decrements)
//   type = "WM"  → weekly partial that completed the month (decrements)
//   type = "BMM" → bimonthly partial that completed the month (decrements)
//   (no type / legacy) → treated as "M" for backward compat
//
// Undo rule: if type contains "M" (i.e. "M", "DM", "WM", "BMM") → also restore +1 month.

function parsePaidEntry(entry: string): { date: string; amount: number | null; type: string } {
  const parts = entry.split(":");
  const date = parts[0] ?? "";
  const rawAmt = parts[1];
  const type = parts[2] ?? "M"; // legacy entries default to monthly
  const amount = rawAmt !== undefined && rawAmt !== "" ? parseFloat(rawAmt) : null;
  return { date, amount: amount === null || isNaN(amount) ? null : amount, type };
}

function buildStatusNotes(
  transactionDate: string | null,
  tenureMonths: number,
  newRemaining: number,
  monthlyPayment: number | null,
  fallback: string,
): string {
  if (newRemaining <= 0) return "Clear";
  const nextDue = computeNextDueDate(transactionDate, tenureMonths, newRemaining);
  if (!nextDue) return fallback;
  const amtLabel = monthlyPayment != null
    ? ` ₹${Math.round(monthlyPayment).toLocaleString("en-IN")}`
    : "";
  return `Next ${new Date(nextDue + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  })}${amtLabel}`;
}

function appendEmiMonth(
  rowNumber: number,
  existing: EmiLoanRow,
  newRemaining: number,
  newStatus: EmiLoanStatus,
  paidDateStr: string,
  amountOrNull: number | null,
  entryType: string,
): { range: string; values: (string | number)[][] }[] {
  const statusNotesText = buildStatusNotes(
    existing.transactionDate, existing.tenureMonths, newRemaining,
    existing.monthlyPayment, existing.statusNotes,
  );
  const entry = amountOrNull != null
    ? `${paidDateStr}:${amountOrNull}:${entryType}`
    : `${paidDateStr}::${entryType}`;
  const prev = existing.paidDates.join("|");
  return [
    { range: `${TAB}!${colLetter(COL.REMAINING_MONTHS)}${rowNumber}`, values: [[newRemaining]] },
    { range: `${TAB}!${colLetter(COL.STATUS)}${rowNumber}`, values: [[newStatus]] },
    { range: `${TAB}!${colLetter(COL.STATUS_NOTES)}${rowNumber}`, values: [[statusNotesText]] },
    { range: `${TAB}!${colLetter(COL.PAID_DATES)}${rowNumber}`, values: [[prev ? `${prev}|${entry}` : entry]] },
  ];
}

/**
 * Marks one monthly EMI payment as paid.
 *
 * Flow:
 *  1. Decrements remainingMonths by 1 (falls back to tenureMonths if never initialised).
 *  2. If remainingMonths reaches 0 → status = "Clear" (loan fully repaid).
 *  3. Appends "YYYY-MM-DD:amount:M" to the paidDates history column.
 */
export async function markEmiMonthlyPayment(
  id: string,
  paidDate: string,
  paidAmount?: number,
): Promise<EmiLoanRow | null> {
  const existing = await getEmiLoanRow(id);
  if (!existing) return null;
  if (existing.status === "Clear") return existing;

  const sheetId = getEmiSpreadsheetId();
  const rowNumber = existing.rowNumber;
  const currentRemaining = existing.remainingMonths ?? existing.tenureMonths;
  const newRemaining = Math.max(currentRemaining - 1, 0);
  const newStatus: EmiLoanStatus = newRemaining <= 0 ? "Clear" : "Pending";

  const updates = appendEmiMonth(rowNumber, existing, newRemaining, newStatus,
    paidDate, paidAmount ?? null, "M");
  await batchUpdateCellsInSheet(sheetId, updates);
  return getEmiLoanRowAtRowNumber(rowNumber);
}

/**
 * Records a partial daily ("D") or weekly ("W") payment.
 *
 * - Appends the entry to paidDates.
 * - Sums all D/W partial entries since the last M/DM/WM marker.
 * - If accumulated total ≥ monthlyPayment → auto-decrements remainingMonths
 *   and tags the entry as "DM" or "WM" instead of "D"/"W".
 */
export async function recordPartialEmiPayment(
  id: string,
  date: string,
  amount: number,
  frequency: "D" | "W" | "BM",
): Promise<EmiLoanRow | null> {
  const existing = await getEmiLoanRow(id);
  if (!existing) return null;
  if (existing.status === "Clear") return existing;

  const sheetId = getEmiSpreadsheetId();
  const rowNumber = existing.rowNumber;

  // Find cycle start date: date of last M / DM / WM / BMM entry (or transactionDate)
  let cycleStartDate = existing.transactionDate ?? "1970-01-01";
  for (let i = existing.paidDates.length - 1; i >= 0; i--) {
    const { date: d, type } = parsePaidEntry(existing.paidDates[i]);
    if (type === "M" || type === "DM" || type === "WM" || type === "BMM") {
      cycleStartDate = d;
      break;
    }
  }

  // Accumulate partial payments in current cycle (D/W/BM entries after cycle start)
  const accumulated = existing.paidDates.reduce((sum, e) => {
    const { date: d, amount: a, type } = parsePaidEntry(e);
    if ((type === "D" || type === "W" || type === "BM") && d > cycleStartDate) {
      return sum + (a ?? 0);
    }
    return sum;
  }, 0);

  const newAccumulated = accumulated + amount;
  const monthlyTarget = existing.monthlyPayment ?? 0;
  const currentRemaining = existing.remainingMonths ?? existing.tenureMonths;

  // For the final partial cycle (remainingMonths < 1) scale the target proportionally.
  // e.g. a 1.5-month loan: after 1 full month, remaining = 0.5 and the
  // cycle closes when accumulated ≥ monthlyPayment × 0.5, not the full amount.
  const cycleFraction = Math.min(currentRemaining, 1);
  const cycleTarget = monthlyTarget * (cycleFraction > 0 ? cycleFraction : 1);

  let updates: { range: string; values: (string | number)[][] }[];

  if (monthlyTarget > 0 && newAccumulated >= cycleTarget) {
    // Accumulated partial payments cover the cycle target — auto-decrement.
    // For a full cycle cycleFraction = 1 so cycleTarget = monthlyPayment (unchanged).
    // For a partial final cycle decrement by the actual remaining fraction so
    // remainingMonths reaches exactly 0 and the loan clears correctly.
    const newRemaining = Math.max(currentRemaining - cycleFraction, 0);

    // Safety cap: prevent over-decrement beyond what calendar time allows.
    // monthsWouldBePaid = number of months that would be marked as paid after this decrement.
    // This must not exceed maxPaidMonths (count of due dates ≤ today) + 1 (pre-paying current month).
    const monthsWouldBePaid = existing.tenureMonths - newRemaining;
    const maxAllowed = existing.transactionDate
      ? computeMaxPaidMonths(existing.transactionDate, existing.tenureMonths) + 1
      : existing.tenureMonths;
    if (monthsWouldBePaid > maxAllowed) {
      // Record as plain partial to avoid corrupting remaining months count.
      const entry = `${date}:${amount}:${frequency}`;
      const prev = existing.paidDates.join("|");
      updates = [
        { range: `${TAB}!${colLetter(COL.PAID_DATES)}${rowNumber}`, values: [[prev ? `${prev}|${entry}` : entry]] },
      ];
      await batchUpdateCellsInSheet(sheetId, updates);
      return getEmiLoanRowAtRowNumber(rowNumber);
    }

    const newStatus: EmiLoanStatus = newRemaining <= 0 ? "Clear" : "Pending";
    const entryType: string = frequency === "D" ? "DM" : frequency === "W" ? "WM" : "BMM";
    updates = appendEmiMonth(rowNumber, existing, newRemaining, newStatus, date, amount, entryType);
  } else {
    // Plain partial — just append, no month change yet.
    const entry = `${date}:${amount}:${frequency}`;
    const prev = existing.paidDates.join("|");
    updates = [
      { range: `${TAB}!${colLetter(COL.PAID_DATES)}${rowNumber}`, values: [[prev ? `${prev}|${entry}` : entry]] },
    ];
  }

  await batchUpdateCellsInSheet(sheetId, updates);
  return getEmiLoanRowAtRowNumber(rowNumber);
}

/**
 * Undoes the last paidDates entry.
 *
 * - If the entry type is "M", "DM", or "WM" (a month was decremented): restores +1 month and
 *   sets status back to "Pending".
 * - If the entry type is "D" or "W" (a plain partial): just removes it, no month change.
 * - If the loan is currently Clear and we're undoing a month marker: sets status back to Pending.
 */
export async function undoLastEmiPayment(id: string): Promise<EmiLoanRow | null> {
  const existing = await getEmiLoanRow(id);
  if (!existing) return null;
  if (existing.paidDates.length === 0) return existing;

  const sheetId = getEmiSpreadsheetId();
  const rowNumber = existing.rowNumber;

  const lastEntry = existing.paidDates[existing.paidDates.length - 1];
  const { type: lastType } = parsePaidEntry(lastEntry);

  const remaining = existing.paidDates.slice(0, -1);
  const newPaidDates = remaining.join("|");

  const updates: { range: string; values: (string | number)[][] }[] = [
    { range: `${TAB}!${colLetter(COL.PAID_DATES)}${rowNumber}`, values: [[newPaidDates]] },
  ];

  // Any type containing "M" means a month was consumed — restore it
  if (lastType === "M" || lastType === "DM" || lastType === "WM" || lastType === "BMM") {
    const currentRemaining = existing.remainingMonths ?? 0;
    const newRemaining = Math.min(currentRemaining + 1, existing.tenureMonths);
    const statusNotesText = buildStatusNotes(
      existing.transactionDate, existing.tenureMonths, newRemaining,
      existing.monthlyPayment, existing.statusNotes,
    );
    updates.push(
      { range: `${TAB}!${colLetter(COL.REMAINING_MONTHS)}${rowNumber}`, values: [[newRemaining]] },
      { range: `${TAB}!${colLetter(COL.STATUS)}${rowNumber}`, values: [["Pending"]] },
      { range: `${TAB}!${colLetter(COL.STATUS_NOTES)}${rowNumber}`, values: [[statusNotesText]] },
    );
  }

  await batchUpdateCellsInSheet(sheetId, updates);
  return getEmiLoanRowAtRowNumber(rowNumber);
}

/**
 * Initialises server-managed tracking columns for an EMI loan created before
 * the monthly-tracking system was added (remainingMonths is null).
 *
 * - Sets remainingMonths = tenureMonths (assumes no payments made so far).
 * - Column C (NEXT_PAYMENT_DATE) is formula-managed — not touched here.
 */
export async function initializeEmiTracking(id: string): Promise<EmiLoanRow | null> {
  const existing = await getEmiLoanRow(id);
  if (!existing) return null;

  if (existing.remainingMonths !== null) {
    // Already initialised; nothing to do.
    return existing;
  }

  const sheetId = getEmiSpreadsheetId();
  await batchUpdateCellsInSheet(sheetId, [
    {
      range: `${TAB}!${colLetter(COL.REMAINING_MONTHS)}${existing.rowNumber}`,
      values: [[existing.tenureMonths]],
    },
  ]);
  return getEmiLoanRowAtRowNumber(existing.rowNumber);
}

export async function deleteEmiLoanRow(id: string): Promise<EmiLoanRow | null> {
  const existing = await getEmiLoanRow(id);
  if (!existing) return null;
  const sheetId = getEmiSpreadsheetId();
  await deleteRowAtInSheet(sheetId, TAB, existing.rowNumber);
  return existing;
}
