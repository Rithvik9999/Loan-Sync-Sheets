import { useParams } from "wouter";
import { useState } from "react";
import { 
  useGetLoan, 
  useGetLoanSchedule,
  useListRepayments,
  useDeleteLoan,
  useDeleteRepayment,
  getGetLoanQueryKey,
  getGetLoanScheduleQueryKey,
  getListRepaymentsQueryKey,
  getListLoansQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAppAuth } from "@/hooks/use-app-auth";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, Edit, Trash2, Calendar, FileText, Plus, Receipt
} from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { LoanStatusBadge, InstallmentStatusBadge } from "@/components/status-badges";
import { EmptyState } from "@/components/empty-state";

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
import RecordRepaymentDialog from "./components/record-repayment-dialog";

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role } = useAppAuth();
  
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isRepaymentOpen, setIsRepaymentOpen] = useState(false);
  const [repaymentToDelete, setRepaymentToDelete] = useState<string | null>(null);

  const { data: loan, isLoading: isLoanLoading } = useGetLoan(id, {
    query: { queryKey: getGetLoanQueryKey(id), enabled: !!id }
  });

  const { data: schedule, isLoading: isScheduleLoading } = useGetLoanSchedule(id, {
    query: { queryKey: getGetLoanScheduleQueryKey(id), enabled: !!id }
  });

  const { data: repayments, isLoading: isRepaymentsLoading } = useListRepayments({ loanId: id }, {
    query: { queryKey: getListRepaymentsQueryKey({ loanId: id }), enabled: !!id }
  });

  const deleteLoan = useDeleteLoan();
  const deleteRepayment = useDeleteRepayment();

  const isStaff = role === "staff";

  const handleDelete = () => {
    deleteLoan.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
          toast({ title: "Loan deleted", description: "The loan record has been removed." });
          setLocation("/loans");
        },
        onError: () => {
          toast({ variant: "destructive", title: "Cannot delete", description: "An error occurred." });
          setIsDeleteOpen(false);
        }
      }
    );
  };

  const handleDeleteRepayment = () => {
    if (!repaymentToDelete) return;
    deleteRepayment.mutate(
      { id: repaymentToDelete },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRepaymentsQueryKey({ loanId: id }) });
          queryClient.invalidateQueries({ queryKey: getGetLoanScheduleQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetLoanQueryKey(id) });
          toast({ title: "Repayment deleted", description: "The payment has been removed and schedule recalculated." });
          setRepaymentToDelete(null);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to delete payment." });
          setRepaymentToDelete(null);
        }
      }
    );
  };

  if (isLoanLoading || isScheduleLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!loan || !schedule) {
    return <div className="py-12 text-center">Loan not found.</div>;
  }

  const progress = schedule.totalDue > 0 ? (schedule.totalPaid / schedule.totalDue) * 100 : 0;
  
  // Find next upcoming payment amount
  const upcomingInstallment = schedule.installments.find(i => i.status === 'upcoming' || i.status === 'due_soon' || i.status === 'overdue');
  const suggestedRepaymentAmount = upcomingInstallment ? (upcomingInstallment.amountDue - upcomingInstallment.amountPaid) : schedule.installmentAmount;

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
                {formatCurrency(loan.principal)} Loan
              </h1>
              <LoanStatusBadge status={loan.status} />
            </div>
            <p className="text-muted-foreground mt-1">
              {isStaff ? (
                <>Borrower: <Link href={`/borrowers/${loan.borrowerId}`} className="text-primary hover:underline">{loan.borrowerName}</Link></>
              ) : (
                "Loan Details"
              )}
            </p>
          </div>
        </div>
        
        {isStaff && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Edit className="h-4 w-4 mr-2" /> Edit Terms
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
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1 border-r border-border/50">
                <p className="text-xs text-muted-foreground">Principal</p>
                <p className="text-lg font-semibold font-numeric">{formatCurrency(loan.principal)}</p>
              </div>
              <div className="space-y-1 border-r border-border/50">
                <p className="text-xs text-muted-foreground">Interest Rate</p>
                <p className="text-lg font-semibold font-numeric">{loan.interestRate}% APR</p>
              </div>
              <div className="space-y-1 border-r border-border/50">
                <p className="text-xs text-muted-foreground">Term</p>
                <p className="text-lg font-semibold font-numeric">{loan.termMonths} mos</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Started</p>
                <p className="text-lg font-semibold font-numeric">{formatDate(loan.startDate)}</p>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-border/50">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-foreground">Repayment Progress</span>
                <span className="font-numeric text-muted-foreground">{progress.toFixed(1)}% Paid</span>
              </div>
              <Progress value={progress} className="h-3" />
              <div className="flex justify-between text-sm font-numeric">
                <span className="text-emerald-700 dark:text-emerald-500 font-medium">{formatCurrency(schedule.totalPaid)} collected</span>
                <span className="text-muted-foreground">{formatCurrency(schedule.totalDue)} expected total</span>
              </div>
            </div>
            
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
            <CardTitle>Current Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Outstanding Principal</p>
              <p className="text-3xl font-bold font-numeric text-foreground">{formatCurrency(schedule.outstandingBalance)}</p>
            </div>
            
            <div className="space-y-2 pt-4 border-t border-primary/10">
              <p className="text-sm font-medium text-muted-foreground">Next Action</p>
              {upcomingInstallment ? (
                <div className="bg-background border rounded-lg p-3 shadow-sm">
                  <div className="text-sm font-medium mb-1">Due {formatDate(upcomingInstallment.dueDate)}</div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-numeric">{formatCurrency(upcomingInstallment.amountDue - upcomingInstallment.amountPaid)}</span>
                    <InstallmentStatusBadge status={upcomingInstallment.status} />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-emerald-700 font-medium bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                  No pending installments.
                </div>
              )}
            </div>

            {isStaff && loan.status !== 'paid' && (
              <Button className="w-full mt-4" onClick={() => setIsRepaymentOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Record Payment
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <CardTitle>Repayment Schedule</CardTitle>
          <CardDescription>Computed installments based on loan terms</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">No.</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Amount Due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.installments.map((inst) => (
                  <TableRow key={inst.installmentNumber} className={inst.status === 'overdue' ? 'bg-destructive/5' : ''}>
                    <TableCell className="font-medium">{inst.installmentNumber}</TableCell>
                    <TableCell>{formatDate(inst.dueDate)}</TableCell>
                    <TableCell className="text-right font-numeric font-medium">{formatCurrency(inst.amountDue)}</TableCell>
                    <TableCell className="text-right font-numeric text-muted-foreground">{formatCurrency(inst.amountPaid)}</TableCell>
                    <TableCell className="text-right">
                      <InstallmentStatusBadge status={inst.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>Record of received funds</CardDescription>
          </div>
          {isStaff && loan.status !== 'paid' && (
            <Button size="sm" variant="outline" onClick={() => setIsRepaymentOpen(true)}>
              Record Payment
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isRepaymentsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !repayments || repayments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              description="No payments have been recorded for this loan."
              icon={<Receipt />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date Received</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Notes</TableHead>
                  {isStaff && <TableHead className="w-[80px] text-right"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {repayments.map((rep) => (
                  <TableRow key={rep.id}>
                    <TableCell>{formatDate(rep.paidDate)}</TableCell>
                    <TableCell className="font-medium font-numeric text-emerald-700 dark:text-emerald-500">
                      +{formatCurrency(rep.amount)}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{rep.method?.replace('_', ' ') || '—'}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[200px]">{rep.notes || '—'}</TableCell>
                    {isStaff && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setRepaymentToDelete(rep.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isStaff && (
        <>
          <LoanFormDialog 
            open={isEditOpen} 
            onOpenChange={setIsEditOpen} 
            loan={loan}
          />

          <RecordRepaymentDialog 
            open={isRepaymentOpen}
            onOpenChange={setIsRepaymentOpen}
            loanId={loan.id}
            suggestedAmount={suggestedRepaymentAmount}
          />

          <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Loan Agreement?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this loan and all its recorded payments. 
                  This action cannot be undone.
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

          <AlertDialog open={!!repaymentToDelete} onOpenChange={(open) => !open && setRepaymentToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Payment Record?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the payment from the ledger and recalculate the loan's outstanding balance.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeleteRepayment}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteRepayment.isPending}
                >
                  {deleteRepayment.isPending ? "Deleting..." : "Delete Payment"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
