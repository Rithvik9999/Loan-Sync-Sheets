import { randomUUID } from "node:crypto";
import { appendRow, deleteRowAt, readTab, updateRowAt } from "../sheetsClient";

const TAB = "Borrowers";
const HEADERS = ["id", "name", "email", "phone", "clerkUserId", "createdAt"];

export interface Borrower {
  id: string;
  name: string;
  email: string;
  phone: string;
  clerkUserId: string;
  createdAt: string;
}

export interface BorrowerInput {
  name: string;
  email: string;
  phone?: string | null;
}

function fromRow(row: Record<string, string>): Borrower {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? "",
    clerkUserId: row.clerkUserId ?? "",
    createdAt: row.createdAt,
  };
}

function toRow(borrower: Borrower): Record<string, string> {
  return { ...borrower };
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

export async function getBorrowerByClerkUserId(
  clerkUserId: string,
): Promise<Borrower | null> {
  const { rows } = await readTab(TAB, HEADERS);
  const row = rows.find((r) => r.clerkUserId === clerkUserId);
  return row ? fromRow(row) : null;
}

export async function getBorrowerByEmail(
  email: string,
): Promise<Borrower | null> {
  const { rows } = await readTab(TAB, HEADERS);
  const row = rows.find(
    (r) => r.email.toLowerCase() === email.toLowerCase(),
  );
  return row ? fromRow(row) : null;
}

export async function createBorrower(
  input: BorrowerInput,
): Promise<Borrower> {
  const borrower: Borrower = {
    id: randomUUID(),
    name: input.name,
    email: input.email,
    phone: input.phone ?? "",
    clerkUserId: "",
    createdAt: new Date().toISOString(),
  };
  await appendRow(TAB, HEADERS, toRow(borrower));
  return borrower;
}

export async function updateBorrower(
  id: string,
  patch: Partial<BorrowerInput> & { clerkUserId?: string | null },
): Promise<Borrower | null> {
  const { rows, rowNumbers } = await readTab(TAB, HEADERS);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: Borrower = {
    ...fromRow(rows[idx]),
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone ?? "" } : {}),
    ...(patch.clerkUserId !== undefined
      ? { clerkUserId: patch.clerkUserId ?? "" }
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
