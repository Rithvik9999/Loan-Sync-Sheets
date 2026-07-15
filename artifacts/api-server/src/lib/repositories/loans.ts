import * as heatMap from "../heatMapSheet";
import type { Borrower } from "./borrowers";

export type { LoanRow as LoanRecord, LoanRowInput as LoanInput, LoanRowUpdate as LoanPatch, LoanStatus } from "../heatMapSheet";

/** API-shaped loan: the sheet row plus a resolved borrowerId (matched by name). */
export interface Loan extends heatMap.LoanRow {
  borrowerId: string | null;
}

function matchBorrowerId(name: string, borrowers: Borrower[]): string | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  const match = borrowers.find(
    (b) => b.name.trim().toLowerCase() === normalized,
  );
  return match?.id ?? null;
}

export function attachBorrowerId(
  row: heatMap.LoanRow,
  borrowers: Borrower[],
): Loan {
  return { ...row, borrowerId: matchBorrowerId(row.name, borrowers) };
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
