import { useListLoans, getListLoansQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Link } from "@/components/ui/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Clock, ChevronRight, CalendarClock } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import {
  EmiLoan,
  EMI_LOANS_QUERY_KEY,
  fetchEmiLoans,
} from "@/pages/emi-loans/components/emi-loan-form-dialog";

const RECENT_DAYS = 30;

export default function Recents() {
  const { data: loans, isLoading: isLoadingLoans } = useListLoans(undefined, {
    query: { queryKey: getListLoansQueryKey() },
  });
  const { data: emiLoans, isLoading: isLoadingEmi } = useQuery<EmiLoan[]>({
    queryKey: EMI_LOANS_QUERY_KEY,
    queryFn: fetchEmiLoans,
  });

  const isLoading = isLoadingLoans || isLoadingEmi;

  const today = new Date();

  const recentLoans = (loans ?? []).filter((l) => {
    if (!l.transactionDate) return false;
    const txDate = new Date(l.transactionDate + "T00:00:00Z");
    return differenceInCalendarDays(today, txDate) <= RECENT_DAYS;
  }).sort((a, b) => (b.transactionDate ?? "").localeCompare(a.transactionDate ?? ""));

  const recentEmi = (emiLoans ?? []).filter((e) => {
    if (!e.transactionDate) return false;
    const txDate = new Date(e.transactionDate + "T00:00:00Z");
    return differenceInCalendarDays(today, txDate) <= RECENT_DAYS;
  }).sort((a, b) => (b.transactionDate ?? "").localeCompare(a.transactionDate ?? ""));

  const totalRecent = recentLoans.length + recentEmi.length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Recents
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Loans disbursed in the last {RECENT_DAYS} days
          </p>
        </div>
        {totalRecent > 0 && (
          <Badge variant="secondary" className="text-xs">
            {totalRecent} loan{totalRecent !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {totalRecent === 0 ? (
        <div className="py-16">
          <EmptyState
            title="No recent loans"
            description={`No loans have been disbursed in the last ${RECENT_DAYS} days.`}
            icon={<Clock />}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {recentLoans.length > 0 && (
            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Regular Loans ({recentLoans.length})</CardTitle>
                <CardDescription>Disbursed in the last {RECENT_DAYS} days</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {recentLoans.map((loan) => {
                    const outstanding = Math.max((loan.finalAmount ?? 0) - (loan.paid ?? 0), 0);
                    return (
                      <div
                        key={loan.id}
                        className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{loan.name}</span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                                loan.status === "Clear"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                  : "bg-amber-50 text-amber-700 border-amber-300"
                              }`}
                            >
                              {loan.status}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span className="font-numeric font-medium">{formatCurrency(loan.principal)}</span>
                            <span>·</span>
                            <span>{formatDate(loan.transactionDate)}</span>
                            {loan.returnDate && (
                              <>
                                <span>→</span>
                                <span>{formatDate(loan.returnDate)}</span>
                              </>
                            )}
                          </div>
                          {outstanding > 0 && loan.status !== "Clear" && (
                            <p className="text-xs text-destructive mt-0.5 font-numeric">
                              Outstanding: {formatCurrency(outstanding)}
                            </p>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" className="shrink-0 ml-2" asChild>
                          <Link href={`/loans/${loan.id}`}>
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {recentEmi.length > 0 && (
            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  EMI Loans ({recentEmi.length})
                </CardTitle>
                <CardDescription>Disbursed in the last {RECENT_DAYS} days</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {recentEmi.map((loan) => {
                    const daysAgo = differenceInCalendarDays(
                      today,
                      new Date(loan.transactionDate + "T00:00:00Z"),
                    );
                    return (
                      <div
                        key={loan.id}
                        className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{loan.name}</span>
                            <Badge variant="outline" className="text-xs border-blue-200 text-blue-700">EMI</Badge>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                                loan.status === "Clear"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                  : "bg-amber-50 text-amber-700 border-amber-300"
                              }`}
                            >
                              {loan.status}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span className="font-numeric font-medium">{formatCurrency(loan.principal)}</span>
                            <span>·</span>
                            <span>{formatDate(loan.transactionDate)}</span>
                          </div>
                          {loan.monthlyPayment && (
                            <p className="text-xs text-muted-foreground mt-0.5 font-numeric">
                              {formatCurrency(loan.monthlyPayment)}/mo · {loan.remainingMonths ?? "?"} months left
                            </p>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" className="shrink-0 ml-2" asChild>
                          <Link href={`/emi-loans/${loan.id}`}>
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
