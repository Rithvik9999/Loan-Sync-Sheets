// Zod validation schemas used by the API server for request/response parsing.
// We intentionally export only from generated/api (Zod schemas) to avoid name
// conflicts with the generated/types TypeScript interfaces, which have the same
// export names (e.g. LoginBody exists in both as a Zod schema and a TS type).
export * from "./generated/api";

// TypeScript-only types that don't conflict with the Zod schema names above.
export type { ActivityItem } from "./generated/types/activityItem";
export type { ActivityItemType } from "./generated/types/activityItemType";
export type { Borrower } from "./generated/types/borrower";
export type { BorrowerInput } from "./generated/types/borrowerInput";
export type { BorrowerUpdate } from "./generated/types/borrowerUpdate";
export type { DashboardSummary } from "./generated/types/dashboardSummary";
export type { HealthStatus } from "./generated/types/healthStatus";
export type { ListLoansParams } from "./generated/types/listLoansParams";
export type { Loan } from "./generated/types/loan";
export type { LoanInput } from "./generated/types/loanInput";
export type { LoanRequest } from "./generated/types/loanRequest";
export type { LoanRequestInput } from "./generated/types/loanRequestInput";
export type { LoanRequestStatus } from "./generated/types/loanRequestStatus";
export type { LoanRequestUpdate } from "./generated/types/loanRequestUpdate";
export type { LoanStatus } from "./generated/types/loanStatus";
export type { LoanUpdate } from "./generated/types/loanUpdate";
export type { MeInfoRole } from "./generated/types/meInfoRole";
export type { RecentActivity } from "./generated/types/recentActivity";
