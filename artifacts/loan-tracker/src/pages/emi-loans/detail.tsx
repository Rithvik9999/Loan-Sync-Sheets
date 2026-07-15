import { useParams } from "wouter";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAppAuth } from "@/hooks/use-app-auth";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import { ArrowLeft, Edit, Trash2, Calendar, FileText } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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

import EmiLoanFormDialog, { EmiLoan, EMI_LOANS_QUERY_KEY, emiLoanQueryKey, fetchEmiLoans } from "./components/emi-loan-form-dialog";

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

export default function EmiLoanDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role } = useAppAuth();

  const [isEditOpen, setIsEditOpen] = useState(false);
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

  const computed: { label: string; value: string }[] = [
    { label: "Monthly Payment", value: loan.monthlyPayment != null ? formatCurrency(loan.monthlyPayment) : "—" },
    { label: "Flat Fee", value: loan.flatFee != null ? formatCurrency(loan.flatFee) : "—" },
    { label: "Interest %", value: loan.interestPct != null ? `${Number((loan.interestPct * 100).toFixed(2))}%` : "—" },
    { label: "Interest / Month", value: loan.interestPerMonth != null ? formatCurrency(loan.interestPerMonth) : "—" },
    { label: "Total Interest", value: loan.totalInterest != null ? formatCurrency(loan.totalInterest) : "—" },
    { label: "Principal / Month", value: loan.principalPerMonth != null ? formatCurrency(loan.principalPerMonth) : "—" },
    { label: "Late Fees", value: loan.lateFees != null ? formatCurrency(loan.lateFees) : "—" },
    { label: "Remaining Months", value: loan.remainingMonths != null ? String(loan.remainingMonths) : "—" },
  ];

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

        {isStaff && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </Button>
            <Button variant="destructive" onClick={() => setIsDeleteStep1Open(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        )}
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
                <p className="text-lg font-semibold font-numeric">{c.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isStaff && (
        <>
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
