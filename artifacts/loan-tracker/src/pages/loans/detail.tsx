import { useParams } from "wouter";
import { useState } from "react";
import {
  useGetLoan,
  useDeleteLoan,
  getGetLoanQueryKey,
  getListLoansQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAppAuth } from "@/hooks/use-app-auth";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import { ArrowLeft, Edit, Trash2, Calendar, FileText, Plus } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { LoanStatusBadge } from "@/components/status-badges";

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

import LoanFormDialog from "./components/loan-form-dialog";
import RecordPaymentDialog from "./components/record-payment-dialog";

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role } = useAppAuth();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const { data: loan, isLoading: isLoanLoading } = useGetLoan(id, {
    query: { queryKey: getGetLoanQueryKey(id), enabled: !!id },
  });

  const deleteLoan = useDeleteLoan();
  const isStaff = role === "staff";

  const handleDelete = () => {
    deleteLoan.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
          toast({ title: "Loan deleted", description: "The row has been removed from the sheet." });
          setLocation("/loans");
        },
        onError: () => {
          toast({ variant: "destructive", title: "Cannot delete", description: "An error occurred." });
          setIsDeleteOpen(false);
        },
      },
    );
  };

  if (isLoanLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!loan) {
    return <div className="py-12 text-center">Loan not found.</div>;
  }

  const stats: { label: string; value: string; muted?: boolean }[] = [
    { label: "Principal", value: formatCurrency(loan.principal) },
    { label: "Tenure", value: `${loan.tenureDays} days` },
    { label: "Transaction Date", value: formatDate(loan.transactionDate) },
    { label: "Return Date", value: loan.returnDate ? formatDate(loan.returnDate) : "—" },
  ];

  const computed: { label: string; value: string }[] = [
    { label: "Flat Fee", value: loan.flatFee != null ? formatCurrency(loan.flatFee) : "—" },
    { label: "Interest %", value: loan.interestPct != null ? `${loan.interestPct}%` : "—" },
    { label: "Interest", value: loan.interest != null ? formatCurrency(loan.interest) : "—" },
    { label: "Late Days", value: loan.lateDays != null ? String(loan.lateDays) : "—" },
    { label: "Late Fees", value: loan.lateFees != null ? formatCurrency(loan.lateFees) : "—" },
    { label: "Profit", value: loan.profit != null ? formatCurrency(loan.profit) : "—" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href={isStaff ? "/loans" : "/portal"}><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">
                {loan.name}
              </h1>
              <LoanStatusBadge status={loan.status} />
            </div>
          </div>
        </div>

        {isStaff && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </Button>
            <Button variant="destructive" onClick={() => setIsDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Loan Details</CardTitle>
            <CardDescription>Inputs recorded directly on your Heat Map sheet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((s) => (
                <div key={s.label} className="space-y-1 border-r border-border/50 last:border-r-0">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-semibold font-numeric">{s.value}</p>
                </div>
              ))}
            </div>

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
            <CardTitle>Final Amount</CardTitle>
            <CardDescription>Computed by the sheet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Amount to Collect</p>
              <p className="text-3xl font-bold font-numeric text-foreground">
                {loan.finalAmount != null ? formatCurrency(loan.finalAmount) : "—"}
              </p>
            </div>

            <div className="space-y-1 pt-4 border-t border-primary/10">
              <p className="text-sm font-medium text-muted-foreground">Collected So Far</p>
              <p className="text-xl font-semibold font-numeric text-emerald-700 dark:text-emerald-500">
                {formatCurrency(loan.paid ?? 0)}
              </p>
            </div>

            {isStaff && (
              <Button className="w-full mt-4" onClick={() => setIsPaymentOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Record Payment
              </Button>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
          <LoanFormDialog open={isEditOpen} onOpenChange={setIsEditOpen} loan={loan} />

          <RecordPaymentDialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen} loan={loan} />

          <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Loan Row?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this row from the Heat Map sheet. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteLoan.isPending}
                >
                  {deleteLoan.isPending ? "Deleting..." : "Delete Loan"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
