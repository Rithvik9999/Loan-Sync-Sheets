import { useAppAuth } from "@/hooks/use-app-auth";
import { useGetDashboardSummary, useGetRecentActivity, getGetDashboardSummaryQueryKey, getGetRecentActivityQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Users, CreditCard, DollarSign, AlertCircle, ArrowRight } from "lucide-react";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { isLoaded, role } = useAppAuth();
  
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({
    query: {
      enabled: isLoaded && role === "staff",
      queryKey: getGetDashboardSummaryQueryKey()
    }
  });

  const { data: activityData, isLoading: isLoadingActivity } = useGetRecentActivity({
    query: {
      enabled: isLoaded && role === "staff",
      queryKey: getGetRecentActivityQueryKey()
    }
  });

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
        <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">Portfolio Overview</h1>
        <p className="text-muted-foreground mt-1">Live from your Heat Map sheet — the sheet's own formulas compute every figure below.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Outstanding</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-numeric">{formatCurrency(summary?.totalOutstanding)}</div>
            <p className="text-xs text-muted-foreground mt-1 text-balance">
              Final amount due across {summary?.activeLoansCount} pending loans
            </p>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Collected</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-500 font-numeric">{formatCurrency(summary?.totalCollected)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Payments received to date
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Due Soon</CardTitle>
            <CreditCard className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-500 font-numeric">{summary?.dueSoonCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Loans returning in the next 7 days
            </p>
          </CardContent>
        </Card>

        <Card className={summary?.overdueLoansCount && summary.overdueLoansCount > 0 ? "border-destructive/30 bg-destructive/5" : "shadow-sm border-border/60"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
            <AlertCircle className={summary?.overdueLoansCount && summary.overdueLoansCount > 0 ? "h-4 w-4 text-destructive" : "h-4 w-4 text-muted-foreground"} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-numeric ${summary?.overdueLoansCount && summary.overdueLoansCount > 0 ? "text-destructive" : ""}`}>
              {formatCurrency(summary?.overdueAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Late fees across {summary?.overdueLoansCount || 0} loans
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Most recently added or settled loans</CardDescription>
          </CardHeader>
          <CardContent>
            {activityData?.items && activityData.items.length > 0 ? (
              <div className="space-y-6">
                {activityData.items.map((item, i) => (
                  <div key={i} className="flex items-center">
                    <div className="ml-4 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {item.description}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.borrowerName} • {formatDate(item.occurredAt)}
                      </p>
                    </div>
                    {item.amount != null && (
                      <div className="ml-auto font-medium font-numeric">
                        {item.type === 'loan_settled' ? '+' : ''}{formatCurrency(item.amount)}
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
                <Link href="/loans">View All Loans <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Manage your ledger</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/borrowers" className="flex items-center p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors group">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Users className="h-5 w-5" />
              </div>
              <div className="ml-4 flex-1 space-y-1">
                <p className="text-sm font-medium leading-none">Add Borrower</p>
                <p className="text-xs text-muted-foreground">Create a new borrower profile</p>
              </div>
            </Link>

            <Link href="/loans" className="flex items-center p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors group">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="ml-4 flex-1 space-y-1">
                <p className="text-sm font-medium leading-none">Record Loan</p>
                <p className="text-xs text-muted-foreground">Add a new row to the Heat Map sheet</p>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
