import { useState } from "react";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppAuth } from "@/hooks/use-app-auth";
import { useGetLoan, useGetLoanSchedule, getGetLoanQueryKey, getGetLoanScheduleQueryKey, useListLoans, getListLoansQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { InstallmentStatusBadge, LoanStatusBadge } from "@/components/status-badges";
import { EmptyState } from "@/components/empty-state";
import { Calendar, CreditCard, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

export default function Portal() {
  const { isLoaded, role, borrowerId } = useAppAuth();

  const { data: loans, isLoading: isLoadingLoans } = useListLoans(
    { borrowerId: borrowerId ?? "" }, 
    {
      query: {
        enabled: isLoaded && role === "borrower" && !!borrowerId,
        queryKey: getListLoansQueryKey({ borrowerId: borrowerId ?? "" })
      }
    }
  );

  if (isLoadingLoans) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!loans || loans.length === 0) {
    return (
      <div className="py-12">
        <EmptyState
          title="No loans found"
          description="You don't have any active or past loans on record."
          icon={<CreditCard />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">My Portal</h1>
        <p className="text-muted-foreground mt-1">View your active loans and upcoming payment schedule.</p>
      </div>

      <div className="grid gap-6">
        {loans.map(loan => (
          <LoanPortalCard key={loan.id} loanId={loan.id} />
        ))}
      </div>
    </div>
  );
}

function LoanPortalCard({ loanId }: { loanId: string }) {
  const { data: loan, isLoading: isLoanLoading } = useGetLoan(loanId, {
    query: { queryKey: getGetLoanQueryKey(loanId) }
  });
  
  const { data: schedule, isLoading: isScheduleLoading } = useGetLoanSchedule(loanId, {
    query: { queryKey: getGetLoanScheduleQueryKey(loanId) }
  });

  if (isLoanLoading || isScheduleLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!loan || !schedule) return null;

  const progress = schedule.totalDue > 0 ? (schedule.totalPaid / schedule.totalDue) * 100 : 0;
  
  const upcomingInstallment = schedule.installments.find(i => i.status === 'upcoming' || i.status === 'due_soon' || i.status === 'overdue');

  return (
    <Card className="overflow-hidden shadow-sm border-border/60">
      <div className="bg-primary/5 px-6 py-4 border-b flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium font-serif flex items-center gap-3">
            {formatCurrency(loan.principal)} Loan
            <LoanStatusBadge status={loan.status} />
          </h2>
          <p className="text-sm text-muted-foreground">Started {formatDate(loan.startDate)} • {loan.interestRate}% APR</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/loans/${loan.id}`}>
            View Details <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
      
      <CardContent className="p-0">
        <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
          <div className="p-6 space-y-6 md:col-span-1">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Outstanding Balance</div>
              <div className="text-3xl font-bold font-numeric text-foreground">{formatCurrency(schedule.outstandingBalance)}</div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium font-numeric">{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground font-numeric">
                <span>{formatCurrency(schedule.totalPaid)} paid</span>
                <span>{formatCurrency(schedule.totalDue)} total</span>
              </div>
            </div>
          </div>
          
          <div className="p-6 md:col-span-2 bg-muted/10">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-medium">Next Payment Due</h3>
            </div>
            
            {upcomingInstallment ? (
              <div className="rounded-lg border bg-background p-4 flex justify-between items-center shadow-sm">
                <div>
                  <div className="text-lg font-bold font-numeric">{formatCurrency(upcomingInstallment.amountDue - upcomingInstallment.amountPaid)}</div>
                  <div className="text-sm text-muted-foreground">Due on {formatDate(upcomingInstallment.dueDate)}</div>
                </div>
                <InstallmentStatusBadge status={upcomingInstallment.status} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-background/50 p-6 text-center text-sm text-muted-foreground">
                No upcoming payments.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
