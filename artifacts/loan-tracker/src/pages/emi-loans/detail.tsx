import { useParams } from "wouter";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAppAuth } from "@/hooks/use-app-auth";
import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import { ArrowLeft, Edit, Trash2, Calendar, FileText, Loader2, CircleDollarSign } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import EmiLoanFormDialog, { EmiLoan, EMI_LOANS_QUERY_KEY, emiLoanQueryKey } from "./components/emi-loan-form-dialog";

function EmiStatusBadge({ status }: { status: string }) {
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

async function fetchEmiLoan(id: string): Promise<EmiLoan> {
  const res = await fetch(`/api/emi-loans/${id}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Not found" }));
    throw new Error(err.error || "EMI loan not found");
  }
  return res.json();
}

async function deleteEmiLoan(id: string): Promise<void> {
  const res = await fetch(`/api/emi-loans/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: "Failed to delete" }));
    throw new Error(err.error || "Failed to delete EMI loan");
  }
}

/** Dialog to record a monthly EMI payment with editable amount. */
function RecordEmiPaymentDialog({
  open,
  onOpenChange,
  loan,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loan: EmiLoan;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(loan.monthlyPayment ?? ""));
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [markClear, setMarkClear] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Please enter a valid payment amount." });
      return;
    }
    setIsPending(true);
    try {
      if (markClear) {
        // Mark as Clear directly via PATCH
        const res = await fetch(`/api/emi-loans/${loan.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Clear" }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to update status");
      } else {
        // Record one monthly payment
        const res = await fetch(`/api/emi-loans/${loan.id}/pay`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paidDate: date, paidAmount: Number(amount) }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to record payment");
      }
      queryClient.invalidateQueries({ queryKey: emiLoanQueryKey(loan.id) });
      queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
      toast({
        title: markClear ? "Loan marked as Clear" : "Payment recorded",
        description: markClear
          ? "The EMI loan has been marked as fully cleared."
          : `₹${Number(amount).toLocaleString("en-IN")} recorded on ${date}.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record EMI Payment</DialogTitle>
          <DialogDescription>
            Record a monthly payment for <strong>{loan.name}</strong>. Adjust the amount if the borrower paid a different figure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Amount Paid (₹)</label>
            <Input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(loan.monthlyPayment ?? 0)}
            />
            <p className="text-xs text-muted-foreground">
              Standard monthly installment: {loan.monthlyPayment != null ? formatCurrency(loan.monthlyPayment) : "—"}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Payment Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <input
              id="mark-clear"
              type="checkbox"
              checked={markClear}
              onChange={(e) => setMarkClear(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <label htmlFor="mark-clear" className="text-sm text-amber-900 cursor-pointer">
              Mark loan as <strong>fully cleared</strong> (skip month advance, set status to Clear)
            </label>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className={markClear ? "bg-emerald-700 hover:bg-emerald-800 text-white" : ""}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {markClear ? "Mark as Clear" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EmiLoanDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role } = useAppAuth();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isDeleteStep1Open, setIsDeleteStep1Open] = useState(false);
  const [isDeleteStep2Open, setIsDeleteStep2Open] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: loan, isLoading } = useQuery<EmiLoan>({
    queryKey: emiLoanQueryKey(id),
    queryFn: () => fetchEmiLoan(id),
    enabled: !!id,
  });

  const isStaff = role === "staff";

  const handleDelete = async () => {
    if (!loan) return;
    setIsDeleting(true);
    try {
      await deleteEmiLoan(loan.id);
      queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
      toast({ title: "EMI Loan deleted", description: "The row has been removed from the sheet." });
      setLocation("/emi-loans");
    } catch (err) {
      toast({ variant: "destructive", title: "Cannot delete", description: err instanceof Error ? err.message : "An error occurred." });
      setIsDeleteStep2Open(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!loan) {
    return <div className="py-12 text-center">EMI Loan not found.</div>;
  }

  const now = new Date();
  const isOverdue =
    loan.nextPaymentDate &&
    new Date(loan.nextPaymentDate) < now &&
    loan.status !== "Clear";

  const perDayCharge =
    isOverdue && loan.lateFees != null && (loan.lateDays ?? 0) > 0
      ? Math.round(loan.lateFees / (loan.lateDays ?? 1))
      : null;

  const stats: { label: string; value: string; highlight?: boolean }[] = [
    { label: "EMI ID", value: loan.emiId ?? "—" },
    { label: "Principal", value: formatCurrency(loan.principal) },
    { label: "Tenure", value: `${loan.tenureMonths} months` },
    { label: "Transaction Date", value: formatDate(loan.transactionDate) },
    {
      label: "Next Payment",
      value: loan.nextPaymentDate ? formatDate(loan.nextPaymentDate) : "—",
      highlight: !!isOverdue,
    },
  ];

  const computed: { label: string; value: string; highlight?: "red" | "amber" }[] = [
    { label: "Monthly Payment", value: loan.monthlyPayment != null ? formatCurrency(loan.monthlyPayment) : "—" },
    { label: "Flat Fee", value: loan.flatFee != null ? formatCurrency(loan.flatFee) : "—" },
    { label: "Interest %", value: loan.interestPct != null ? `${Number((loan.interestPct * 100).toFixed(2))}%` : "—" },
    { label: "Interest / Month", value: loan.interestPerMonth != null ? formatCurrency(loan.interestPerMonth) : "—" },
    { label: "Total Interest", value: loan.totalInterest != null ? formatCurrency(loan.totalInterest) : "—" },
    { label: "Principal / Month", value: loan.principalPerMonth != null ? formatCurrency(loan.principalPerMonth) : "—" },
    { label: "Late Fees", value: loan.lateFees != null ? formatCurrency(loan.lateFees) : "—" },
    ...(perDayCharge != null
      ? [{ label: "Per Day Late Charges", value: formatCurrency(perDayCharge), highlight: "amber" as const }]
      : []),
    { label: "Days Overdue", value: (loan.lateDays ?? 0) > 0 ? `${loan.lateDays} days` : "—" },
    { label: "Remaining Months", value: loan.remainingMonths != null ? String(loan.remainingMonths) : "—" },
  ];

  // Parse paidDates: entries are "YYYY-MM-DD:amount" or "YYYY-MM-DD"
  const paymentHistory = (loan.paidDates ?? [])
    .map((entry, i) => {
      const colonIdx = entry.indexOf(":");
      const date = colonIdx !== -1 ? entry.slice(0, colonIdx) : entry;
      const amount = colonIdx !== -1 ? Number(entry.slice(colonIdx + 1)) : null;
      return { index: i, date, amount };
    })
    .reverse(); // newest first

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href={isStaff ? "/emi-loans" : "/portal"}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">
                {loan.name}
              </h1>
              <EmiStatusBadge status={loan.status} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {isStaff && loan.status !== "Clear" && (
            <Button
              variant="outline"
              className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              onClick={() => setIsPayOpen(true)}
            >
              <CircleDollarSign className="h-4 w-4 mr-2" /> Record Payment
            </Button>
          )}
          {isStaff && (
            <>
              <Button variant="outline" onClick={() => setIsEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" /> Edit
              </Button>
              <Button variant="destructive" onClick={() => setIsDeleteStep1Open(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Loan Details</CardTitle>
            <CardDescription>Inputs recorded directly on your EMI sheet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((s) => (
                <div key={s.label} className="space-y-1 border-r border-border/50 last:border-r-0">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-lg font-semibold font-numeric ${s.highlight ? "text-destructive" : ""}`}>
                    {s.value}
                    {s.highlight && <span className="ml-1 text-xs font-normal">(overdue)</span>}
                  </p>
                </div>
              ))}
            </div>

            {loan.statusNotes && (
              <div className="pt-4 border-t border-border/50 text-sm">
                <span className="text-muted-foreground">Status Notes: </span>
                <span className="font-medium">{loan.statusNotes}</span>
              </div>
            )}

            {loan.whatsapp && (
              <div className="pt-4 border-t border-border/50 text-sm">
                <span className="text-muted-foreground">WhatsApp / Phone: </span>
                <span className="font-medium">{loan.whatsapp}</span>
              </div>
            )}

            {loan.notes && (
              <div className="pt-4 border-t border-border/50">
                <p className="text-sm font-medium flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-muted-foreground" /> Notes
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{loan.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-1 shadow-sm border-border/60 bg-primary/5">
          <CardHeader>
            <CardTitle>Monthly Payment</CardTitle>
            <CardDescription>Computed by the sheet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Monthly Installment</p>
              <p className="text-3xl font-bold font-numeric text-foreground">
                {loan.monthlyPayment != null ? formatCurrency(loan.monthlyPayment) : "—"}
              </p>
            </div>

            <div className="space-y-1 pt-4 border-t border-primary/10">
              <p className="text-sm font-medium text-muted-foreground">Discount / Month</p>
              <p className="text-xl font-semibold font-numeric text-emerald-700 dark:text-emerald-500">
                {loan.discountPerMonth !== 0 ? formatCurrency(loan.discountPerMonth) : "None"}
              </p>
            </div>

            <div className="space-y-1 pt-4 border-t border-primary/10">
              <p className="text-sm font-medium text-muted-foreground">Remaining Months</p>
              <p className="text-xl font-semibold font-numeric">
                {loan.remainingMonths != null ? loan.remainingMonths : "—"}
              </p>
            </div>

            {perDayCharge != null && (
              <div className="space-y-1 pt-4 border-t border-amber-200">
                <p className="text-sm font-medium text-amber-700">Per Day Late Charges</p>
                <p className="text-xl font-semibold font-numeric text-amber-700">
                  {formatCurrency(perDayCharge)}/day
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(loan.lateFees!)} ÷ {loan.lateDays} days
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <CardTitle>Computed Fields</CardTitle>
          <CardDescription className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Calculated by your sheet's formulas — never overwritten by this app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {computed.map((c) => (
              <div key={c.label} className="space-y-1">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p
                  className={`text-lg font-semibold font-numeric ${
                    c.highlight === "red"
                      ? "text-destructive"
                      : c.highlight === "amber"
                        ? "text-amber-700"
                        : ""
                  }`}
                >
                  {c.value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      {paymentHistory.length > 0 && (
        <Card className="shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>Monthly payments recorded on this EMI loan (newest first).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {paymentHistory.map((entry) => (
                <div
                  key={entry.index}
                  className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{entry.date ? formatDate(entry.date) : "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      Payment #{paymentHistory.length - entry.index}
                    </p>
                  </div>
                  <div className="font-bold font-numeric text-emerald-700">
                    {entry.amount != null && entry.amount > 0
                      ? formatCurrency(entry.amount)
                      : <span className="text-muted-foreground text-sm">—</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isStaff && (
        <>
          <RecordEmiPaymentDialog open={isPayOpen} onOpenChange={setIsPayOpen} loan={loan} />
          <EmiLoanFormDialog open={isEditOpen} onOpenChange={setIsEditOpen} loan={loan} />

          {/* Step 1 — initial warning */}
          <AlertDialog open={isDeleteStep1Open} onOpenChange={setIsDeleteStep1Open}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this EMI loan?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the row from the EMI sheet. Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => { setIsDeleteStep1Open(false); setIsDeleteStep2Open(true); }}
                >
                  Yes, continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Step 2 — final irreversible confirmation */}
          <AlertDialog open={isDeleteStep2Open} onOpenChange={setIsDeleteStep2Open}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>This cannot be undone</AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to permanently delete the EMI loan for <strong>{loan.name}</strong> ({loan.emiId}). The row will be removed from the sheet and cannot be recovered.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete Permanently"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
