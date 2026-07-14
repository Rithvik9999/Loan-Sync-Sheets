import { randomUUID } from "node:crypto";
import { appendRow, deleteRowAt, readTab, updateRowAt } from "../sheetsClient";

const TAB = "Loans";
const HEADERS = [
  "id",
  "borrowerId",
  "principal",
  "interestRate",
  "termMonths",
  "startDate",
  "status",
  "notes",
  "createdAt",
];

export type LoanStatus = "active" | "paid" | "overdue" | "defaulted";

export interface LoanRecord {
  id: string;
  borrowerId: string;
  principal: number;
  interestRate: number;
  termMonths: number;
  startDate: string;
  status: LoanStatus;
  notes: string;
  createdAt: string;
}

export interface LoanInput {
  borrowerId: string;
  principal: number;
  interestRate: number;
  termMonths: number;
  startDate: string;
  status?: LoanStatus;
  notes?: string | null;
}

function fromRow(row: Record<string, string>): LoanRecord {
  return {
    id: row.id,
    borrowerId: row.borrowerId,
    principal: Number(row.principal) || 0,
    interestRate: Number(row.interestRate) || 0,
    termMonths: Number(row.termMonths) || 0,
    startDate: row.startDate,
    status: (row.status as LoanStatus) || "active",
    notes: row.notes ?? "",
    createdAt: row.createdAt,
  };
}

function toRow(loan: LoanRecord): Record<string, string> {
  return {
    id: loan.id,
    borrowerId: loan.borrowerId,
    principal: String(loan.principal),
    interestRate: String(loan.interestRate),
    termMonths: String(loan.termMonths),
    startDate: loan.startDate,
    status: loan.status,
    notes: loan.notes,
    createdAt: loan.createdAt,
  };
}

export async function listLoans(): Promise<LoanRecord[]> {
  const { rows } = await readTab(TAB, HEADERS);
  return rows.map(fromRow);
}

export async function getLoan(id: string): Promise<LoanRecord | null> {
  const { rows } = await readTab(TAB, HEADERS);
  const row = rows.find((r) => r.id === id);
  return row ? fromRow(row) : null;
}

export async function createLoan(input: LoanInput): Promise<LoanRecord> {
  const loan: LoanRecord = {
    id: randomUUID(),
    borrowerId: input.borrowerId,
    principal: input.principal,
    interestRate: input.interestRate,
    termMonths: input.termMonths,
    startDate: input.startDate,
    status: input.status ?? "active",
    notes: input.notes ?? "",
    createdAt: new Date().toISOString(),
  };
  await appendRow(TAB, HEADERS, toRow(loan));
  return loan;
}

export async function updateLoan(
  id: string,
  patch: Partial<LoanInput>,
): Promise<LoanRecord | null> {
  const { rows, rowNumbers } = await readTab(TAB, HEADERS);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: LoanRecord = {
    ...fromRow(rows[idx]),
    ...patch,
    notes: patch.notes !== undefined ? (patch.notes ?? "") : fromRow(rows[idx]).notes,
  };
  await updateRowAt(TAB, rowNumbers[idx], HEADERS, toRow(updated));
  return updated;
}

export async function deleteLoan(id: string): Promise<LoanRecord | null> {
  const { rows, rowNumbers } = await readTab(TAB, HEADERS);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const deleted = fromRow(rows[idx]);
  await deleteRowAt(TAB, rowNumbers[idx]);
  return deleted;
}
