import * as heatMap from "../heatMapSheet";
import type { Borrower } from "./borrowers";
import { extractPhoneFromWhatsapp, normalizePhone } from "../authTokens";

export type { LoanRow as LoanRecord, LoanRowInput as LoanInput, LoanRowUpdate as LoanPatch, LoanStatus } from "../heatMapSheet";

/** API-shaped loan: the sheet row plus a resolved borrowerId (matched by phone, then name). */
export interface Loan extends heatMap.LoanRow {
  borrowerId: string | null;
}

/**
 * Matches a loan/EMI row to a borrower.
 * Strategy:
 *  1. If the row has a usable phone (from whatsapp), find a borrower with that
 *     normalized phone — phone match is authoritative.
 *  2. Fall back to lowercased name match for legacy rows that have no phone data
 *     or no borrower registered with that phone.
 */
function matchBorrowerId(
  name: string,
  whatsapp: string | null | undefined,
  borrowers: Borrower[],
): string | null {
  // --- Phone-first ---
  const rowPhone = extractPhoneFromWhatsapp(whatsapp);
  if (rowPhone) {
    const byPhone = borrowers.find(
      (b) => normalizePhone(b.phone) === rowPhone,
    );
    if (byPhone) return byPhone.id;
  }

  // --- Name fallback ---
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  const byName = borrowers.find(
    (b) => b.name.trim().toLowerCase() === normalized,
  );
  return byName?.id ?? null;
}

export function attachBorrowerId(
  row: heatMap.LoanRow,
  borrowers: Borrower[],
): Loan {
  return {
    ...row,
    borrowerId: matchBorrowerId(row.name, row.whatsapp, borrowers),
  };
}

export async function listLoans(): Promise<heatMap.LoanRow[]> {
  return heatMap.listLoanRows();
}

export async function getLoan(id: string): Promise<heatMap.LoanRow | null> {
  return heatMap.getLoanRow(id);
}

export async function createLoan(
  input: heatMap.LoanRowInput,
): Promise<heatMap.LoanRow> {
  return heatMap.createLoanRow(input);
}

export async function updateLoan(
  id: string,
  patch: heatMap.LoanRowUpdate,
): Promise<heatMap.LoanRow | null> {
  return heatMap.updateLoanRow(id, patch);
}

export async function deleteLoan(id: string): Promise<heatMap.LoanRow | null> {
  return heatMap.deleteLoanRow(id);
}
