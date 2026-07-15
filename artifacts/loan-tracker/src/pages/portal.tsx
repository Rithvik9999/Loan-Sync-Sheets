import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppAuth } from "@/hooks/use-app-auth";
import { useListLoans, getListLoansQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { LoanStatusBadge } from "@/components/status-badges";
import { EmptyState } from "@/components/empty-state";
import { CreditCard, ChevronRight } from "lucide-react";

export default function Portal() {
  const { isLoaded, role } = useAppAuth();

  const { data: loans, isLoading: isLoadingLoans } = useListLoans(undefined, {
    query: {
      enabled: isLoaded && role === "borrower",
      queryKey: getListLoansQueryKey(),
    },
  });

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
          description="You don't have any loans on record."
          icon={<CreditCard />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">My Portal</h1>
        <p className="text-muted-foreground mt-1">View your loans and what's due, straight from the ledger.</p>
      </div>

      <div className="grid gap-6">
        {loans.map((loan) => (
          <Card key={loan.id} className="overflow-hidden shadow-sm border-border/60">
            <div className="bg-primary/5 px-6 py-4 border-b flex justify-between items-center">
              <div>
                <h2 className="text-lg font-medium font-serif flex items-center gap-3">
                  {formatCurrency(loan.principal)} Loan
                  <LoanStatusBadge status={loan.status} />
                </h2>
                <p className="text-sm text-muted-foreground">
                  Transacted {formatDate(loan.transactionDate)} • {loan.tenureDays} days
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/loans/${loan.id}`}>
                  View Details <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <CardContent className="p-0">
              <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
                <div className="p-6 space-y-2 md:col-span-1">
                  <div className="text-sm text-muted-foreground">Amount to Collect</div>
                  <div className="text-3xl font-bold font-numeric text-foreground">
                    {loan.finalAmount != null ? formatCurrency(loan.finalAmount) : "—"}
                  </div>
                </div>

                <div className="p-6 md:col-span-1 bg-muted/10 space-y-2">
                  <div className="text-sm text-muted-foreground">Collected So Far</div>
                  <div className="text-xl font-semibold font-numeric">{formatCurrency(loan.paid ?? 0)}</div>
                </div>

                <div className="p-6 md:col-span-1 space-y-2">
                  <div className="text-sm text-muted-foreground">Return Date</div>
                  <div className="text-xl font-semibold font-numeric">
                    {loan.returnDate ? formatDate(loan.returnDate) : "—"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
