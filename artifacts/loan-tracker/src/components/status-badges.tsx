import { LoanStatus, ScheduleInstallmentStatus } from "@workspace/api-client-react/api.schemas";
import { Badge } from "./ui/badge";

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  switch (status) {
    case 'active':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Active</Badge>;
    case 'paid':
      return <Badge variant="success">Paid</Badge>;
    case 'overdue':
      return <Badge variant="destructive">Overdue</Badge>;
    case 'defaulted':
      return <Badge variant="outline" className="border-red-200 text-red-800 bg-red-50">Defaulted</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function InstallmentStatusBadge({ status }: { status: ScheduleInstallmentStatus }) {
  switch (status) {
    case 'paid':
      return <Badge variant="success">Paid</Badge>;
    case 'upcoming':
      return <Badge variant="secondary">Upcoming</Badge>;
    case 'due_soon':
      return <Badge variant="warning">Due Soon</Badge>;
    case 'overdue':
      return <Badge variant="destructive">Overdue</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
