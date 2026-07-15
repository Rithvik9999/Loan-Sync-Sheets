import { randomUUID } from "node:crypto";
import { appendRow, deleteRowAt, readTab, updateRowAt } from "../sheetsClient";
import { normalizePhone } from "../authTokens";

const TAB = "Borrowers";
// Email removed — phone is the primary identity for portal login.
// `pin` is stored in plain text (intentionally — it's a staff-managed
// 6-digit PIN, not a password) and is stripped out by toPublic() below
// before ever reaching an API response, so the frontend never sees it.
const HEADERS = ["id", "name", "phone", "pin", "creditLimit", "createdAt"];

export interface Borrower {
  id: string;
  name: string;
  phone: string;
  pin: string;
  creditLimit: number | null;
  createdAt: string;
}

export interface BorrowerInput {
  name: string;
  phone?: string | null;
  pin?: string | null;
  creditLimit?: number | null;
}

function fromRow(row: Record<string, string>): Borrower {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    pin: row.pin ?? "",
    creditLimit: row.creditLimit ? Number(row.creditLimit) : null,
    createdAt: row.createdAt,
  };
}

function toRow(borrower: Borrower): Record<string, string> {
  return {
    id: borrower.id,
    name: borrower.name,
    phone: borrower.phone,
    pin: borrower.pin,
    creditLimit: borrower.creditLimit != null ? String(borrower.creditLimit) : "",
    createdAt: borrower.createdAt,
  };
}

/** Shape returned to API clients — never leaks the plain-text PIN. */
export function toPublic(borrower: Borrower) {
  const { pin, ...rest } = borrower;
  return { ...rest, hasPin: Boolean(pin) };
}
// Public shape type (for TypeScript consumers)
export type BorrowerPublic = ReturnType<typeof toPublic>;

export async function listBorrowers(): Promise<Borrower[]> {
  const { rows } = await readTab(TAB, HEADERS);
  return rows.map(fromRow);
}

export async function getBorrower(id: string): Promise<Borrower | null> {
  const { rows } = await readTab(TAB, HEADERS);
  const row = rows.find((r) => r.id === id);
  return row ? fromRow(row) : null;
}

export async function getBorrowerByPhone(
  phone: string,
): Promise<Borrower | null> {
  const target = normalizePhone(phone);
  if (!target) return null;
  const { rows } = await readTab(TAB, HEADERS);
  const row = rows.find((r) => normalizePhone(r.phone ?? "") === target);
  return row ? fromRow(row) : null;
}

export async function createBorrower(
  input: BorrowerInput,
): Promise<Borrower> {
  const borrower: Borrower = {
    id: randomUUID(),
    name: input.name,
    phone: input.phone ?? "",
    pin: input.pin ?? "",
    creditLimit: input.creditLimit ?? null,
    createdAt: new Date().toISOString(),
  };
  await appendRow(TAB, HEADERS, toRow(borrower));
  return borrower;
}

export async function updateBorrower(
  id: string,
  patch: Partial<BorrowerInput>,
): Promise<Borrower | null> {
  const { rows, rowNumbers } = await readTab(TAB, HEADERS);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: Borrower = {
    ...fromRow(rows[idx]),
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone ?? "" } : {}),
    ...(patch.pin ? { pin: patch.pin } : {}),
    ...(patch.creditLimit !== undefined ? { creditLimit: patch.creditLimit ?? null } : {}),
  };
  await updateRowAt(TAB, rowNumbers[idx], HEADERS, toRow(updated));
  return updated;
}

export async function deleteBorrower(id: string): Promise<Borrower | null> {
  const { rows, rowNumbers } = await readTab(TAB, HEADERS);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const deleted = fromRow(rows[idx]);
  await deleteRowAt(TAB, rowNumbers[idx]);
  return deleted;
}
