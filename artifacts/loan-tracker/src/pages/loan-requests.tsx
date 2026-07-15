import {
  useListLoanRequests,
  useDeleteLoanRequest,
  getListLoanRequestsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ClipboardList,
  Phone,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { Link } from "@/components/ui/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const statusColor: Record<string, string> = {
  Pending: "text-amber-600 border-amber-300 bg-amber-50",
  Approved: "text-emerald-700 border-emerald-300 bg-emerald-50",
  Rejected: "text-red-600 border-red-300 bg-red-50",
};

type LoanRequest = {
  id: string;
  name: string;
  phone: string;
  borrowerId: string | null;
  amount: number;
  tenureDays: number;
  tenureMonths?: number | null;
  type?: string;
  purpose: string | null;
  status: "Pending" | "Approved" | "Rejected";
  createdAt: string;
};

function RequestRow({ req }: { req: LoanRequest }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteReq = useDeleteLoanRequest();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = () => {
    deleteReq.mutate(
      { id: req.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListLoanRequestsQueryKey(),
          });
          toast({ title: "Request deleted" });
          setDeleteOpen(false);
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not delete.",
          });
        },
      },
    );
  };

  const isEmi = req.type === "EMI";
  const tenureLabel = isEmi
    ? `${req.tenureMonths ?? "?"} months`
    : req.tenureDays > 0
      ? `${req.tenureDays} days`
      : "EMI";

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border bg-card hover:bg-muted/20 transition-colors">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{req.name}</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColor[req.status]}`}
            >
              {req.status}
            </span>
            {isEmi && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                EMI
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" />
            {req.phone || "—"}
          </div>
          <div className="text-sm flex flex-wrap gap-3 mt-0.5">
            <span>
              Amount:{" "}
              <span className="font-semibold font-numeric">
                {formatCurrency(req.amount)}
              </span>
            </span>
            <span>
              Tenure: <span className="font-semibold">{tenureLabel}</span>
            </span>
          </div>
          {req.purpose && (
            <p className="text-xs text-muted-foreground italic mt-0.5">
              {req.purpose}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{formatDate(req.createdAt)}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/loan-requests/${req.id}`}>
              View Details
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loan Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this request from the sheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function LoanRequests() {
  const { data: requests, isLoading } = useListLoanRequests({
    query: { queryKey: getListLoanRequestsQueryKey() },
  });

  const pending = requests?.filter((r) => r.status === "Pending") ?? [];
  const processed = requests?.filter((r) => r.status !== "Pending") ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">
          Loan Requests
        </h1>
        {pending.length > 0 && (
          <span className="inline-flex items-center justify-center h-6 px-2.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
            {pending.length} pending
          </span>
        )}
      </div>

      {!requests || requests.length === 0 ? (
        <div className="py-12">
          <EmptyState
            title="No loan requests"
            description="Borrowers haven't submitted any loan requests yet."
            icon={<ClipboardList />}
          />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                    {pending.length}
                  </span>
                  Pending
                </CardTitle>
                <CardDescription>
                  Click "View Details" to review and approve or decline
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pending.map((r) => (
                  <RequestRow key={r.id} req={r as LoanRequest} />
                ))}
              </CardContent>
            </Card>
          )}

          {processed.length > 0 && (
            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Processed</CardTitle>
                <CardDescription>
                  Previously approved or rejected requests
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {processed.map((r) => (
                  <RequestRow key={r.id} req={r as LoanRequest} />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
