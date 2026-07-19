import { useParams } from "wouter";
import { useState, useEffect } from "react";
import {
  useListLoanRequests,
  useUpdateLoanRequest,
  useDeleteLoanRequest,
  getListLoanRequestsQueryKey,
  useGetLoan,
  useUpdateLoan,
  getGetLoanQueryKey,
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
import { estimateFinalAmount } from "@/lib/early-payment-discount";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Phone,
  User,
  CalendarDays,
  Info,
  MessageCircle,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ADMIN_WHATSAPP = "8917656405";

/**
 * Rounds the repayment amount down to the nearest ₹10 (≥₹1000) or ₹5 (<₹1000).
 * The difference between the raw computed final amount and this floor is the
 * "rounding discount" that makes the repayment a clean number.
 * Must stay in sync with the copy in portal.tsx and loan-form-dialog.tsx.
 */
function floorRepaymentAmount(amount: number): number {
  if (amount < 1000) return Math.floor(amount / 5) * 5;
  return Math.floor(amount / 10) * 10;
}

/** Digits only, strips a leading 91/+91 country code, capped at 10 digits. */
function sanitizePhoneForWa(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  return digits.slice(0, 10);
}

function notifyBorrowerLoanApproved(params: {
  phone: string;
  name: string;
  principal: number;
  tenureLabel: string;
  flatFee: number;
  interest: number;
  discount: number;
  finalAmount: number;
  transactionDate: string;
  repaymentDueDate: string;
  requestId?: string;
}): void {
  const phone = sanitizePhoneForWa(params.phone);
  if (phone.length !== 10) return;
  const lines = [
    `✅ Loan Approved — Hi ${params.name}!`,
    ``,
    `📋 Loan Summary:`,
    `• Principal: ₹${params.principal.toLocaleString("en-IN")}`,
    `• Tenure: ${params.tenureLabel}`,
    `• Flat Fee (est.): ₹${params.flatFee.toLocaleString("en-IN")}`,
    `• Interest (est.): ₹${params.interest.toLocaleString("en-IN")}`,
  ];
  if (params.discount > 0) {
    lines.push(`• Discount: −₹${params.discount.toLocaleString("en-IN")}`);
  }
  lines.push(
    `• Final Amount (est.): ₹${params.finalAmount.toLocaleString("en-IN")}`,
    ``,
    `📅 Transaction Date: ${params.transactionDate}`,
    `📅 Repayment Due: ${params.repaymentDueDate}`,
  );
  if (params.requestId) lines.push(`🔖 ID: ${params.requestId}`);
  lines.push(``, `openr3.in`);
  const msg = lines.join("\n");
  window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, "_blank");
}

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

  // Auto-populate the discount field:
  //  - Pending: use the rounding-discount formula so admin only needs to override.
  //  - Approved: pre-fill with the discount that was stored at approval time.
  useEffect(() => {
    if (!req) return;
    if (req.status === "Pending") {
      const p = req.amount ?? 0;
      const t = req.tenureDays ?? 0;
      if (!p || !t) return;
      const { finalAmount } = estimateFinalAmount({ principal: p, tenureDays: t });
      const rounded = floorRepaymentAmount(finalAmount);
      const diff = finalAmount - rounded;
      setDiscount(diff > 0 ? String(diff) : "0");
    } else if (req.status === "Approved") {
      setDiscount(String((req as any).discount ?? 0));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.id]);
  const [isPaying, setIsPaying] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const updateReq = useUpdateLoanRequest();
  const deleteReq = useDeleteLoanRequest();
  const updateLoan = useUpdateLoan();

  // For approved requests: fetch the actual loan so we can show its authoritative finalAmount
  // and allow the admin to update the discount.
  const reqLoanId = (req as any)?.loanId as string | null | undefined;
  const { data: approvedLoan, refetch: refetchApprovedLoan } = useGetLoan(
    reqLoanId ?? "",
    { query: { queryKey: getGetLoanQueryKey(reqLoanId ?? ""), enabled: !!reqLoanId && req?.status === "Approved" } },
  );

  const discountNum = Number(discount) || 0;
  const principal = req?.amount ?? 0;
  const tenureDays = req?.tenureDays ?? 0;
  // NOTE: discount is stored as a negative discountOrCharges in the sheet.
  // The sheet's array formula computes: finalAmount = principal + flatFee + interest + discountOrCharges + lateFees.
  // We estimate flat fee + interest using the same tiered formulas from early-payment-discount.ts.
  // The admin-entered discount reduces this estimated final amount.
  const {
    flatFee: estimatedFlatFee,
    interest: estimatedInterest,
    finalAmount: estimatedFinalAmount,
  } = estimateFinalAmount({ principal, tenureDays, discount: discountNum });

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
        // discount is written as -discountNum into sheet's discountOrCharges column,
        // which applies to the sheet-computed finalAmount (principal + fees + interest).
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
        description: "Loan entry has been recorded in your sheet. Opening WhatsApp to confirm with the borrower…",
      });
      if (req.phone) {
        const isEmiReq = (req as any).type === "EMI";
        const tenureLabel = isEmiReq
          ? `${(req as any).tenureMonths ?? "—"} months`
          : `${req.tenureDays} days`;
        const txDate = new Date(transactionDate);
        const dueDate = new Date(txDate);
        dueDate.setDate(dueDate.getDate() + (req.tenureDays ?? 0));
        const dueDateStr = dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        notifyBorrowerLoanApproved({
          phone: req.phone,
          name: req.name,
          principal,
          tenureLabel,
          flatFee: estimatedFlatFee,
          interest: estimatedInterest,
          discount: discountNum,
          finalAmount: estimatedFinalAmount,
          transactionDate,
          repaymentDueDate: dueDateStr,
          requestId: req.id,
        });
      }
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

  const handleDelete = () => {
    if (!req) return;
    setIsDeleting(true);
    deleteReq.mutate(
      { id: req.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLoanRequestsQueryKey() });
          toast({ title: "Request deleted" });
          setLocation("/loan-requests");
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Could not delete request." });
          setIsDeleting(false);
          setDeleteConfirmOpen(false);
        },
      },
    );
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

  /** Update the discount on an already-approved loan request (patches both the
   *  loan row in the sheet and the stored discount on the request record). */
  const handleUpdate = async () => {
    if (!req || req.status !== "Approved") return;
    if (discountNum < 0) {
      toast({ variant: "destructive", title: "Invalid discount", description: "Discount cannot be negative." });
      return;
    }
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/loan-requests/${req.id}/update-approval`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount: discountNum }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to update." }));
        throw new Error(err.error ?? "Failed to update.");
      }
      queryClient.invalidateQueries({ queryKey: getListLoanRequestsQueryKey() });
      if (reqLoanId) refetchApprovedLoan();
      toast({ title: "Loan updated", description: "Discount patched — the sheet will recompute the final amount." });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed." });
    } finally {
      setIsUpdating(false);
    }
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

      {/* Approval / Discount section — shown for pending AND approved requests */}
      {(isPending || req.status === "Approved") && (
        <Card className="shadow-sm border-primary/20 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isPending ? "Approve & Record Payment" : "Edit Loan Details"}
            </CardTitle>
            <CardDescription>
              {isPending
                ? "Enter a discount (₹0 if none) and confirm the transaction date. Clicking \"Mark as Paid\" will create a Pending loan entry in your sheet."
                : "Update the discount applied to this approved loan. The sheet will recompute the final amount automatically."}
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
                <span className="text-muted-foreground">Est. flat fee</span>
                <span className="font-numeric">+ {formatCurrency(estimatedFlatFee)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Est. interest</span>
                <span className="font-numeric">+ {formatCurrency(estimatedInterest)}</span>
              </div>
              {discountNum > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount (applied to final)</span>
                  <span className="font-numeric text-emerald-700">
                    − {formatCurrency(discountNum)}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2 rounded bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Estimates mirror the sheet's tiered formula. The sheet's array formula is the authoritative final figure once the loan row is created.</span>
              </div>
              <div className="flex justify-between border-t pt-2.5 mt-1">
                <span className="font-semibold text-sm">Estimated Final Amount</span>
                <span className="font-bold font-numeric text-xl">
                  {formatCurrency(estimatedFinalAmount)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              {isPending ? (
                <>
                  <Button
                    className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white"
                    onClick={handlePay}
                    disabled={isPaying || isDeclining || discount.trim() === "" || !transactionDate}
                  >
                    {isPaying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Mark as Paid
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleDecline}
                    disabled={isPaying || isDeclining}
                  >
                    {isDeclining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                    Decline
                  </Button>
                </>
              ) : (
                <Button
                  className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white"
                  onClick={handleUpdate}
                  disabled={isUpdating || discount.trim() === ""}
                >
                  {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Update Loan
                </Button>
              )}
            </div>

            {/* Delete permanently — only for pending */}
            {isPending && (
              <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                    disabled={isPaying || isDeclining || isDeleting}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Request
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this request?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove the loan request from your sheet. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Yes, delete permanently
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </CardContent>
        </Card>
      )}

      {/* Result details — shown for already-processed requests */}
      {!isPending && (
        <Card className="shadow-sm border-border/60">
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              {req.status === "Approved" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              <span className="text-sm font-medium">
                {req.status === "Approved"
                  ? "Approved — loan disbursed and recorded in the sheet."
                  : "This request was declined."}
              </span>
            </div>
            {req.status === "Approved" && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-emerald-900">Loan summary</p>
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-700">Principal</span>
                  <span className="font-numeric font-semibold">{formatCurrency(principal)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-700">Tenure</span>
                  <span className="font-semibold">{tenureLabel}</span>
                </div>
                {!isEmi && tenureDays > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-700">Discount / Charges</span>
                      <span className={`font-numeric font-semibold ${(req.discount ?? 0) > 0 ? "text-emerald-800" : "text-muted-foreground"}`}>
                        {(req.discount ?? 0) > 0 ? `− ${formatCurrency(req.discount)}` : "None"}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-emerald-200 pt-1.5">
                      <span className="text-emerald-700 font-semibold">Total to repay</span>
                      {approvedLoan?.finalAmount != null ? (
                        <span className="font-bold font-numeric">{formatCurrency(approvedLoan.finalAmount)}</span>
                      ) : (
                        <span className="font-bold font-numeric">
                          {formatCurrency(estimatedFinalAmount)}
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">(est.)</span>
                        </span>
                      )}
                    </div>
                  </>
                )}
                <p className="text-[10px] text-emerald-600">
                  {approvedLoan?.finalAmount != null
                    ? "Sheet-computed final amount — authoritative."
                    : "Exact final amount will appear once the linked loan loads."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
