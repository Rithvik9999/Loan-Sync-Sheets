import { useParams } from "wouter";
import { useState } from "react";
import {
  useListLoanRequests,
  useUpdateLoanRequest,
  getListLoanRequestsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Phone,
  User,
  CalendarDays,
  Info,
} from "lucide-react";

const STATUS_CLASSES: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border border-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Rejected: "bg-red-50 text-red-700 border border-red-200",
};

export default function LoanRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useListLoanRequests({
    query: { queryKey: getListLoanRequestsQueryKey() },
  });

  const req = requests?.find((r) => r.id === id);

  const [discount, setDiscount] = useState("0");
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [isPaying, setIsPaying] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  const updateReq = useUpdateLoanRequest();

  const discountNum = Number(discount) || 0;
  const principal = req?.amount ?? 0;
  const finalAmount = Math.max(0, principal - discountNum);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqAny = req as any;

  const handlePay = async () => {
    if (!req) return;
    if (discountNum < 0) {
      toast({
        variant: "destructive",
        title: "Invalid discount",
        description: "Discount cannot be negative.",
      });
      return;
    }
    setIsPaying(true);
    try {
      const res = await fetch(`/api/loan-requests/${req.id}/pay`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount: discountNum, transactionDate }),
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Failed to mark as paid." }));
        throw new Error(err.error ?? "Failed to mark as paid.");
      }
      queryClient.invalidateQueries({ queryKey: getListLoanRequestsQueryKey() });
      toast({
        title: "Marked as Paid",
        description: "Loan entry has been recorded in your sheet.",
      });
      setLocation("/loan-requests");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Failed.",
      });
    } finally {
      setIsPaying(false);
    }
  };

  const handleDecline = () => {
    if (!req) return;
    setIsDeclining(true);
    updateReq.mutate(
      { id: req.id, data: { status: "Rejected" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListLoanRequestsQueryKey(),
          });
          toast({ title: "Request declined" });
          setLocation("/loan-requests");
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not decline request.",
          });
          setIsDeclining(false);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!req) {
    return (
      <div className="py-12 text-center text-muted-foreground max-w-2xl mx-auto">
        Request not found.{" "}
        <Link href="/loan-requests" className="underline">
          Back to requests
        </Link>
      </div>
    );
  }

  const isPending = req.status === "Pending";
  const isEmi = reqAny.type === "EMI";
  const tenureLabel = isEmi
    ? `${reqAny.tenureMonths ?? "—"} months`
    : `${req.tenureDays} days`;

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link href="/loan-requests">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold font-serif">Request Details</h1>
          <p className="text-sm text-muted-foreground">Review and approve or decline</p>
        </div>
        <Badge className={`ml-auto ${STATUS_CLASSES[req.status]}`}>
          {req.status}
        </Badge>
      </div>

      {/* Borrower Info */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Borrower</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium text-sm">{req.name}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="font-medium text-sm">{req.phone || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="font-medium text-sm">{formatDate(req.createdAt)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Loan Type</p>
              <Badge variant="outline" className="mt-1 text-xs">
                {isEmi ? "EMI Loan" : "Regular Loan"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loan Figures */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Loan Details</CardTitle>
          <CardDescription>Details from the borrower's request</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Principal (Requested)</p>
              <p className="text-2xl font-bold font-numeric mt-0.5">
                {formatCurrency(req.amount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tenure</p>
              <p className="text-2xl font-bold mt-0.5">{tenureLabel}</p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Interest, flat fee, and final amount will be computed automatically
              by your sheet formulas once the loan row is created.
            </span>
          </div>

          {req.purpose && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">Purpose</p>
              <p className="text-sm italic text-muted-foreground mt-0.5">
                {req.purpose}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval / Discount section — only for pending requests */}
      {isPending && (
        <Card className="shadow-sm border-primary/20 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Approve & Record Payment</CardTitle>
            <CardDescription>
              Enter a discount (₹0 if none) and confirm the transaction date.
              Clicking "Mark as Paid" will create a Clear loan entry in your
              sheet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Discount (₹) <span className="text-destructive">*</span>
                </label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter 0 if no discount applies.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Transaction Date</label>
                <Input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                />
              </div>
            </div>

            {/* Live breakdown */}
            <div className="rounded-lg border bg-background p-4 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Principal</span>
                <span className="font-numeric font-medium">
                  {formatCurrency(principal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-numeric text-emerald-700">
                  − {formatCurrency(discountNum)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2.5 mt-1">
                <span className="font-semibold text-sm">Final Amount (Paid)</span>
                <span className="font-bold font-numeric text-xl">
                  {formatCurrency(finalAmount)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={handlePay}
                disabled={
                  isPaying ||
                  isDeclining ||
                  discount.trim() === "" ||
                  !transactionDate
                }
              >
                {isPaying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Mark as Paid
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDecline}
                disabled={isPaying || isDeclining}
              >
                {isDeclining ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Already processed */}
      {!isPending && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          This request has already been{" "}
          {req.status === "Approved" ? "approved" : "declined"}.
        </div>
      )}
    </div>
  );
}
