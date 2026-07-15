import { randomUUID } from "node:crypto";
import { appendRow, deleteRowAt, readTab, updateRowAt } from "../sheetsClient";

const TAB = "LoanRequests";
const HEADERS = [
  "id",
  "name",
  "phone",
  "borrowerId",
  "amount",
  "tenureDays",
  "tenureMonths",
  "type",
  "purpose",
  "status",
  "createdAt",
];

export type LoanRequestStatus = "Pending" | "Approved" | "Rejected";

export interface LoanRequest {
  id: string;
  name: string;
  phone: string;
  borrowerId: string | null;
  amount: number;
  tenureDays: number;
  tenureMonths: number | null;
  type: "Loan" | "EMI";
  purpose: string | null;
  status: LoanRequestStatus;
  createdAt: string;
}

export interface LoanRequestInput {
  name: string;
  phone: string;
  borrowerId: string | null;
  amount: number;
  tenureDays: number;
  tenureMonths?: number | null;
  type?: "Loan" | "EMI";
  purpose?: string | null;
}

function fromRow(row: Record<string, string>): LoanRequest {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    borrowerId: row.borrowerId || null,
    amount: Number(row.amount) || 0,
    tenureDays: Number(row.tenureDays) || 0,
    tenureMonths: row.tenureMonths ? Number(row.tenureMonths) : null,
    type: (row.type as "Loan" | "EMI") || "Loan",
    purpose: row.purpose || null,
    status: (row.status as LoanRequestStatus) || "Pending",
    createdAt: row.createdAt,
  };
}

function toRow(request: LoanRequest): Record<string, string> {
  return {
    ...request,
    borrowerId: request.borrowerId ?? "",
    purpose: request.purpose ?? "",
    amount: String(request.amount),
    tenureDays: String(request.tenureDays),
    tenureMonths: request.tenureMonths != null ? String(request.tenureMonths) : "",
    type: request.type,
  };
}

export async function listLoanRequests(): Promise<LoanRequest[]> {
  const { rows } = await readTab(TAB, HEADERS);
  return rows.map(fromRow);
}

export async function createLoanRequest(
  input: LoanRequestInput,
): Promise<LoanRequest> {
  const request: LoanRequest = {
    id: randomUUID(),
    name: input.name,
    phone: input.phone,
    borrowerId: input.borrowerId,
    amount: input.amount,
    tenureDays: input.tenureDays,
    tenureMonths: input.tenureMonths ?? null,
    type: input.type ?? "Loan",
    purpose: input.purpose ?? null,
    status: "Pending",
    createdAt: new Date().toISOString(),
  };
  await appendRow(TAB, HEADERS, toRow(request));
  return request;
}

export async function updateLoanRequestStatus(
  id: string,
  status: LoanRequestStatus,
): Promise<LoanRequest | null> {
  const { rows, rowNumbers } = await readTab(TAB, HEADERS);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: LoanRequest = { ...fromRow(rows[idx]), status };
  await updateRowAt(TAB, rowNumbers[idx], HEADERS, toRow(updated));
  return updated;
}

export async function deleteLoanRequest(
  id: string,
): Promise<LoanRequest | null> {
  const { rows, rowNumbers } = await readTab(TAB, HEADERS);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const deleted = fromRow(rows[idx]);
  await deleteRowAt(TAB, rowNumbers[idx]);
  return deleted;
}
