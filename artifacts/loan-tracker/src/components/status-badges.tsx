import { LoanStatus } from "@workspace/api-client-react";
import { Badge } from "./ui/badge";

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  switch (status) {
    case "Pending":
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Pending</Badge>;
    case "Clear":
      return <Badge variant="success">Clear</Badge>;
    case "Temp":
      return <Badge variant="outline" className="border-amber-200 text-amber-800 bg-amber-50">Temp</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
