import { randomUUID } from "node:crypto";
import { appendRow, batchUpdateCells, deleteRowAt, readTab, updateRowAt } from "../sheetsClient";

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
  "upiId",
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
  upiId: string | null;
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
  upiId?: string | null;
}

const VALID_LOAN_REQUEST_STATUSES: LoanRequestStatus[] = ["Pending", "Approved", "Rejected"];

function fromRow(row: Record<string, string>): LoanRequest {
  const rawStatus = row.status ?? "";
  const status: LoanRequestStatus = VALID_LOAN_REQUEST_STATUSES.includes(rawStatus as LoanRequestStatus)
    ? (rawStatus as LoanRequestStatus)
    : "Pending";
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
    upiId: row.upiId || null,
    status,
    createdAt: row.createdAt,
  };
}

function toRow(request: LoanRequest): Record<string, string> {
  return {
    ...request,
    borrowerId: request.borrowerId ?? "",
    purpose: request.purpose ?? "",
    upiId: request.upiId ?? "",
    amount: String(request.amount),
    tenureDays: String(request.tenureDays),
    tenureMonths: request.tenureMonths != null ? String(request.tenureMonths) : "",
    type: request.type,
  };
}

/**
 * readTabWithIds: reads the LoanRequests tab and synchronously writes back any
 * missing IDs so that subsequent find-by-id operations (update, delete) always
 * see the same IDs the list API returned to the client.
 */
async function readTabWithIds(): Promise<{ rows: Record<string, string>[]; rowNumbers: number[] }> {
  const { rows, rowNumbers } = await readTab(TAB, HEADERS);
  const idBackfills: { range: string; values: (string | number)[][] }[] = [];
  rows.forEach((row, i) => {
    if (!row.id) {
      const newId = randomUUID();
      row.id = newId;
      idBackfills.push({ range: `${TAB}!A${rowNumbers[i]}`, values: [[newId]] });
    }
  });
  if (idBackfills.length > 0) {
    // Await so IDs are in the sheet before any caller tries to find them by ID.
    await batchUpdateCells(idBackfills);
  }
  return { rows, rowNumbers };
}

export async function listLoanRequests(): Promise<LoanRequest[]> {
  const { rows } = await readTabWithIds();
  return rows
    .map((row) => fromRow(row))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
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
    upiId: input.upiId ?? null,
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
  const { rows, rowNumbers } = await readTabWithIds();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: LoanRequest = { ...fromRow(rows[idx]), status };
  await updateRowAt(TAB, rowNumbers[idx], HEADERS, toRow(updated));
  return updated;
}

export async function deleteLoanRequest(
  id: string,
): Promise<LoanRequest | null> {
  const { rows, rowNumbers } = await readTabWithIds();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const deleted = fromRow(rows[idx]);
  await deleteRowAt(TAB, rowNumbers[idx]);
  return deleted;
}
