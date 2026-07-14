import type { LoanRecord } from "./repositories/loans";
import type { Repayment } from "./repositories/repayments";

export type InstallmentStatus = "paid" | "due_soon" | "overdue" | "upcoming";

export interface ScheduleInstallment {
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: InstallmentStatus;
}

export interface LoanSchedule {
  loanId: string;
  installmentAmount: number;
  installments: ScheduleInstallment[];
  totalDue: number;
  totalPaid: number;
  outstandingBalance: number;
}

const DUE_SOON_WINDOW_DAYS = 7;

function addMonths(dateStr: string, months: number): Date {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Total amount owed on a loan over its full term: principal + simple interest for the term. */
export function totalDueForLoan(loan: LoanRecord): number {
  const interest = loan.principal * (loan.interestRate / 100) * (loan.termMonths / 12);
  return round2(loan.principal + interest);
}

export function totalPaidForLoan(
  loanId: string,
  repayments: Repayment[],
): number {
  return round2(
    repayments
      .filter((r) => r.loanId === loanId)
      .reduce((sum, r) => sum + r.amount, 0),
  );
}

export function outstandingBalanceForLoan(
  loan: LoanRecord,
  repayments: Repayment[],
): number {
  const paid = totalPaidForLoan(loan.id, repayments);
  return round2(Math.max(totalDueForLoan(loan) - paid, 0));
}

/** Builds an equal-installment amortization schedule and allocates repayments FIFO across installments. */
export function computeLoanSchedule(
  loan: LoanRecord,
  repayments: Repayment[],
): LoanSchedule {
  const totalDue = totalDueForLoan(loan);
  const term = Math.max(loan.termMonths, 1);
  const installmentAmount = round2(totalDue / term);
  const loanRepayments = repayments
    .filter((r) => r.loanId === loan.id)
    .sort((a, b) => a.paidDate.localeCompare(b.paidDate));

  let remainingPaid = loanRepayments.reduce((sum, r) => sum + r.amount, 0);
  const now = new Date();
  const dueSoonCutoff = new Date(now);
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + DUE_SOON_WINDOW_DAYS);

  const installments: ScheduleInstallment[] = [];
  for (let i = 0; i < term; i += 1) {
    const dueDate = addMonths(loan.startDate, i + 1);
    // Last installment absorbs any rounding remainder.
    const amountDue =
      i === term - 1
        ? round2(totalDue - installmentAmount * (term - 1))
        : installmentAmount;
    const amountPaid = round2(Math.max(Math.min(remainingPaid, amountDue), 0));
    remainingPaid = round2(Math.max(remainingPaid - amountPaid, 0));

    let status: InstallmentStatus;
    if (amountPaid >= amountDue - 0.005) {
      status = "paid";
    } else if (dueDate.getTime() < now.getTime()) {
      status = "overdue";
    } else if (dueDate.getTime() <= dueSoonCutoff.getTime()) {
      status = "due_soon";
    } else {
      status = "upcoming";
    }

    installments.push({
      installmentNumber: i + 1,
      dueDate: dueDate.toISOString(),
      amountDue,
      amountPaid,
      status,
    });
  }

  const totalPaid = totalPaidForLoan(loan.id, repayments);

  return {
    loanId: loan.id,
    installmentAmount,
    installments,
    totalDue,
    totalPaid,
    outstandingBalance: round2(Math.max(totalDue - totalPaid, 0)),
  };
}

/** Derives the effective status of a loan from its schedule, without overwriting a terminal "defaulted" status. */
export function effectiveLoanStatus(
  loan: LoanRecord,
  repayments: Repayment[],
): LoanRecord["status"] {
  if (loan.status === "defaulted") return "defaulted";
  const outstanding = outstandingBalanceForLoan(loan, repayments);
  if (outstanding <= 0.005) return "paid";
  const schedule = computeLoanSchedule(loan, repayments);
  const hasOverdue = schedule.installments.some((i) => i.status === "overdue");
  return hasOverdue ? "overdue" : "active";
}
