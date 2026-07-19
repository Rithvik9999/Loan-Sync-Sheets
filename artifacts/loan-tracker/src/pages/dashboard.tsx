import { useAppAuth } from "@/hooks/use-app-auth";
import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useListLoans,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
  getListLoansQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Users,
  CreditCard,
  DollarSign,
  AlertCircle,
  ArrowRight,
  Clock,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoanStatusBadge } from "@/components/status-badges";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEmiLoans, EmiLoan } from "./emi-loans/components/emi-loan-form-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Dashboard() {
  const { isLoaded, role } = useAppAuth();

  const isReady = isLoaded && role === "staff";

  const { data: summary, isLoading: isLoadingSummary } =
    useGetDashboardSummary({
      query: {
        enabled: isReady,
        queryKey: getGetDashboardSummaryQueryKey(),
      },
    });

  const { data: activityData, isLoading: isLoadingActivity } =
    useGetRecentActivity({
      query: {
        enabled: isReady,
        queryKey: getGetRecentActivityQueryKey(),
      },
    });

  const { data: allLoans, isLoading: isLoadingLoans } = useListLoans(
    undefined,
    {
      query: {
        enabled: isReady,
        queryKey: getListLoansQueryKey(),
      },
    },
  );

  const { data: emiLoans, isLoading: isLoadingEmi } = useQuery<EmiLoan[]>({
    queryKey: ["emi-loans"],
    queryFn: fetchEmiLoans,
    enabled: isReady,
  });

  const now = useMemo(() => new Date(), []);

  const overdueLoans = useMemo(
    () =>
      (allLoans ?? [])
        .filter(
          (l) =>
            l.status === "Pending" && l.lateDays != null && l.lateDays > 0,
        )
        .sort((a, b) => (b.lateDays ?? 0) - (a.lateDays ?? 0)),
    [allLoans],
  );

  const pendingUpcoming = useMemo(
    () =>
      (allLoans ?? [])
        .filter((l) => {
          if (l.status !== "Pending") return false;
          if (l.lateDays != null && l.lateDays > 0) return false;
          if (!l.returnDate) return false;
          const due = new Date(l.returnDate);
          const diffDays =
            (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return diffDays >= 0 && diffDays <= 30;
        })
        .sort((a, b) => {
          const da = a.returnDate ? new Date(a.returnDate).getTime() : 0;
          const db = b.returnDate ? new Date(b.returnDate).getTime() : 0;
          return da - db;
        }),
    [allLoans, now],
  );

  // ── Month-wise profit table ──────────────────────────────────────────────
  // Groups by loan issuance month. Expected = total interest+fees scheduled.
  // Gained = interest actually collected so far (paid − principal for regular
  // loans; completed-months × monthly-interest for EMI loans).
  const monthProfit = useMemo(() => {
    const map = new Map<string, { label: string; expected: number; gained: number; count: number }>();
    const toKey = (d: string | null | undefined) => (d ?? "").slice(0, 7); // "YYYY-MM"
    const getOrCreate = (key: string) => {
      if (!map.has(key)) {
        const [yrStr, moStr] = key.split("-");
        const yr = Number(yrStr), mo = Number(moStr);
        const label = new Date(yr, mo - 1, 1).toLocaleDateString("en-IN", {
          month: "short", year: "numeric",
        });
        map.set(key, { label, expected: 0, gained: 0, count: 0 });
      }
      return map.get(key)!;
    };

    // Regular loans
    for (const loan of allLoans ?? []) {
      const key = toKey(loan.transactionDate);
      if (!key) continue;
      const row = getOrCreate(key);
      row.count++;
      row.expected += (loan.interest ?? 0) + (loan.flatFee ?? 0);
      // Gained = profit actually collected.
      // Prefer the sheet-computed profit field (authoritative, accounts for discounts).
      // For cleared loans without a profit field, fall back to paid − principal.
      // For pending loans with partial payments, the fallback gives a rough estimate.
      if (loan.profit != null && loan.profit > 0) {
        row.gained += loan.profit;
      } else if (loan.status === "Clear" && (loan.paid ?? 0) > 0) {
        row.gained += Math.max((loan.paid ?? 0) - loan.principal, 0);
      }
      // Pending loans with no sheet profit: don't count as gained yet.
    }

    // EMI loans
    for (const emi of emiLoans ?? []) {
      const key = toKey(emi.transactionDate);
      if (!key) continue;
      const row = getOrCreate(key);
      row.count++;
      row.expected += (emi.totalInterest ?? 0) + (emi.flatFee ?? 0);
      // Months paid = tenureMonths − remainingMonths
      const paidMonths = (emi.tenureMonths ?? 0) - (emi.remainingMonths ?? emi.tenureMonths ?? 0);
      const monthlyInterest = (emi.interestPerMonth ?? 0);
      row.gained += Math.max(paidMonths * monthlyInterest, 0);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a)) // newest first
      .slice(0, 24) // up to 2 years of history
      .map(([, data]) => data);
  }, [allLoans, emiLoans]);

  if (isLoadingSummary || isLoadingActivity) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24 mb-1" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">
          Portfolio Overview
        </h1>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Outstanding
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-numeric">
              {formatCurrency(summary?.totalOutstanding)}
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-balance">
              Across {summary?.activeLoansCount} pending loans
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Collected
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-500 font-numeric">
              {formatCurrency(summary?.totalCollected)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Payments received to date
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Due Soon
            </CardTitle>
            <CreditCard className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-500 font-numeric">
              {summary?.dueSoonCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Returning in next 7 days
            </p>
          </CardContent>
        </Card>

        <Card
          className={
            summary?.overdueLoansCount && summary.overdueLoansCount > 0
              ? "border-destructive/30 bg-destructive/5"
              : "shadow-sm border-border/60"
          }
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overdue
            </CardTitle>
            <AlertCircle
              className={
                summary?.overdueLoansCount && summary.overdueLoansCount > 0
                  ? "h-4 w-4 text-destructive"
                  : "h-4 w-4 text-muted-foreground"
              }
            />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-numeric ${
                summary?.overdueLoansCount && summary.overdueLoansCount > 0
                  ? "text-destructive"
                  : ""
              }`}
            >
              {formatCurrency(summary?.overdueAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Late fees across {summary?.overdueLoansCount || 0} loans
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Overdue & Pending loans lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Overdue */}
        <Card className="shadow-sm border-destructive/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Overdue Loans
              </CardTitle>
              {overdueLoans.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {overdueLoans.length}
                </Badge>
              )}
            </div>
            <CardDescription>Loans past their return date</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingLoans ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : overdueLoans.length === 0 ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No overdue loans — great!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {overdueLoans.slice(0, 8).map((loan) => (
                  <Link
                    key={loan.id}
                    href={`/loans/${loan.id}`}
                    className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm hover:bg-destructive/10 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium truncate block">
                        {loan.name}
                      </span>
                      <span className="text-xs text-destructive">
                        {loan.lateDays} day{loan.lateDays !== 1 ? "s" : ""}{" "}
                        overdue
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="font-numeric font-semibold text-sm">
                        {loan.finalAmount != null
                          ? formatCurrency(loan.finalAmount)
                          : "—"}
                      </div>
                      <LoanStatusBadge status={loan.status} />
                    </div>
                  </Link>
                ))}
                {overdueLoans.length > 8 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    asChild
                  >
                    <Link href="/loans">
                      +{overdueLoans.length - 8} more
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Due in 30 days */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Due in 30 Days
              </CardTitle>
              {pendingUpcoming.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-xs border-amber-200 text-amber-700 bg-amber-50"
                >
                  {pendingUpcoming.length}
                </Badge>
              )}
            </div>
            <CardDescription>Upcoming returns sorted by due date</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingLoans ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : pendingUpcoming.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No loans due in the next 30 days.
              </div>
            ) : (
              <div className="space-y-2">
                {pendingUpcoming.slice(0, 8).map((loan) => (
                  <Link
                    key={loan.id}
                    href={`/loans/${loan.id}`}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium truncate block">
                        {loan.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Due {loan.returnDate ? formatDate(loan.returnDate) : "—"}
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="font-numeric font-semibold text-sm">
                        {loan.finalAmount != null
                          ? formatCurrency(loan.finalAmount)
                          : "—"}
                      </div>
                    </div>
                  </Link>
                ))}
                {pendingUpcoming.length > 8 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    asChild
                  >
                    <Link href="/loans">
                      +{pendingUpcoming.length - 8} more
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Month-wise Profit Table */}
      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Month-wise Profit
          </CardTitle>
          <CardDescription>
            Expected vs. gained interest — grouped by loan issuance month
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingLoans || isLoadingEmi ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : monthProfit.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[110px]">Month</TableHead>
                    <TableHead className="text-right w-[60px]">Loans</TableHead>
                    <TableHead className="text-right">Expected Profit</TableHead>
                    <TableHead className="text-right">Gained Profit</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthProfit.map((row) => {
                    const remaining = row.expected - row.gained;
                    return (
                      <TableRow key={row.label} className="hover:bg-muted/20">
                        <TableCell className="font-medium text-sm">{row.label}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">{row.count}</TableCell>
                        <TableCell className="text-right font-numeric text-sm">
                          {formatCurrency(row.expected)}
                        </TableCell>
                        <TableCell className="text-right font-numeric text-sm text-emerald-700 dark:text-emerald-500">
                          {formatCurrency(row.gained)}
                        </TableCell>
                        <TableCell className={`text-right font-numeric text-sm ${remaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600"}`}>
                          {remaining > 0 ? formatCurrency(remaining) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity + Quick Actions */}
      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Most recently added or settled loans
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activityData?.items && activityData.items.length > 0 ? (
              <div className="space-y-4">
                {activityData.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        item.type === "loan_settled"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {item.type === "loan_settled" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm font-medium leading-none truncate max-w-[180px] sm:max-w-full">
                        {item.description}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.borrowerName}
                      </p>
                    </div>
                    {item.amount != null && (
                      <div className="ml-auto font-medium font-numeric text-sm shrink-0">
                        {item.type === "loan_settled" ? "+" : ""}
                        {formatCurrency(item.amount)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No recent activity to show.
              </div>
            )}
            <div className="mt-6 pt-4 border-t border-border/50">
              <Button variant="ghost" className="w-full" asChild>
                <Link href="/loans">
                  View All Loans{" "}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Manage your ledger</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/borrowers"
              className="flex items-center p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors group"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Users className="h-5 w-5" />
              </div>
              <div className="ml-4 flex-1 space-y-0.5">
                <p className="text-sm font-medium leading-none">Add Borrower</p>
                <p className="text-xs text-muted-foreground">
                  Create a new borrower profile
                </p>
              </div>
            </Link>

            <Link
              href="/loans"
              className="flex items-center p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors group"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="ml-4 flex-1 space-y-0.5">
                <p className="text-sm font-medium leading-none">Record Loan</p>
                <p className="text-xs text-muted-foreground">
                  Add a new row to the Heat Map sheet
                </p>
              </div>
            </Link>

            <Link
              href="/loan-requests"
              className="flex items-center p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors group"
            >
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Clock className="h-5 w-5" />
              </div>
              <div className="ml-4 flex-1 space-y-0.5">
                <p className="text-sm font-medium leading-none">
                  Loan Requests
                </p>
                <p className="text-xs text-muted-foreground">
                  Review pending borrower requests
                </p>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
