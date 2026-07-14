import { randomUUID } from "node:crypto";
import { appendRow, deleteRowAt, readTab } from "../sheetsClient";

const TAB = "Repayments";
const HEADERS = [
  "id",
  "loanId",
  "amount",
  "paidDate",
  "method",
  "notes",
  "createdAt",
];

export interface Repayment {
  id: string;
  loanId: string;
  amount: number;
  paidDate: string;
  method: string;
  notes: string;
  createdAt: string;
}

export interface RepaymentInput {
  loanId: string;
  amount: number;
  paidDate: string;
  method?: string | null;
  notes?: string | null;
}

function fromRow(row: Record<string, string>): Repayment {
  return {
    id: row.id,
    loanId: row.loanId,
    amount: Number(row.amount) || 0,
    paidDate: row.paidDate,
    method: row.method ?? "",
    notes: row.notes ?? "",
    createdAt: row.createdAt,
  };
}

export async function listRepayments(): Promise<Repayment[]> {
  const { rows } = await readTab(TAB, HEADERS);
  return rows.map(fromRow);
}

export async function createRepayment(
  input: RepaymentInput,
): Promise<Repayment> {
  const repayment: Repayment = {
    id: randomUUID(),
    loanId: input.loanId,
    amount: input.amount,
    paidDate: input.paidDate,
    method: input.method ?? "",
    notes: input.notes ?? "",
    createdAt: new Date().toISOString(),
  };
  await appendRow(TAB, HEADERS, {
    ...repayment,
    amount: String(repayment.amount),
  });
  return repayment;
}

export async function deleteRepayment(id: string): Promise<Repayment | null> {
  const { rows, rowNumbers } = await readTab(TAB, HEADERS);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const deleted = fromRow(rows[idx]);
  await deleteRowAt(TAB, rowNumbers[idx]);
  return deleted;
}
