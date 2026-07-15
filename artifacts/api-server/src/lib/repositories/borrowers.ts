import { randomUUID } from "node:crypto";
import { appendRow, deleteRowAt, readTab, updateRowAt } from "../sheetsClient";
import { hashPassword, normalizePhone } from "../authTokens";

const TAB = "Borrowers";
// Email removed — phone is the primary identity for portal login.
const HEADERS = ["id", "name", "phone", "passwordHash", "createdAt"];

export interface Borrower {
  id: string;
  name: string;
  phone: string;
  passwordHash: string;
  createdAt: string;
}

export interface BorrowerInput {
  name: string;
  phone?: string | null;
  password?: string | null;
}

function fromRow(row: Record<string, string>): Borrower {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    passwordHash: row.passwordHash ?? "",
    createdAt: row.createdAt,
  };
}

function toRow(borrower: Borrower): Record<string, string> {
  return {
    id: borrower.id,
    name: borrower.name,
    phone: borrower.phone,
    passwordHash: borrower.passwordHash,
    createdAt: borrower.createdAt,
  };
}

/** Shape returned to API clients — never leaks the password hash. */
export function toPublic(borrower: Borrower) {
  const { passwordHash, ...rest } = borrower;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

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
    passwordHash: input.password ? await hashPassword(input.password) : "",
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
    ...(patch.password
      ? { passwordHash: await hashPassword(patch.password) }
      : {}),
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
