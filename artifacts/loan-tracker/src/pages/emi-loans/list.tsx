import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ChevronRight, CalendarClock, Filter, ArrowUpDown } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EmiLoanFormDialog, { EmiLoan, EMI_LOANS_QUERY_KEY, fetchEmiLoans } from "./components/emi-loan-form-dialog";

type SortField = "next-payment-asc" | "date-desc" | "date-asc" | "name-asc" | "name-desc" | "amount-desc" | "amount-asc";

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

export default function EmiLoansList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("next-payment-asc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: loans, isLoading } = useQuery<EmiLoan[]>({
    queryKey: EMI_LOANS_QUERY_KEY,
    queryFn: fetchEmiLoans,
  });

  const now = new Date();

  const filtered = loans
    ?.filter((l) => {
      const nameMatch = l.name.toLowerCase().includes(search.toLowerCase());
      const statusMatch = statusFilter === "all" || l.status === statusFilter;
      return nameMatch && statusMatch;
    })
    .sort((a, b) => {
      switch (sortField) {
        case "next-payment-asc": {
          // Overdue (past) payments first, then soonest upcoming
          const da = a.nextPaymentDate ? new Date(a.nextPaymentDate).getTime() : Infinity;
          const db = b.nextPaymentDate ? new Date(b.nextPaymentDate).getTime() : Infinity;
          return da - db;
        }
        case "date-desc": {
          const da = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
          const db = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
          return db - da;
        }
        case "date-asc": {
          const da = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
          const db = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
          return da - db;
        }
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "amount-desc":
          return (b.principal ?? 0) - (a.principal ?? 0);
        case "amount-asc":
          return (a.principal ?? 0) - (b.principal ?? 0);
        default:
          return 0;
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">EMI Loans</h1>
          <p className="text-muted-foreground mt-1">Backed live by your EMI sheet — fees and monthly payments are computed there.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Record EMI Loan
        </Button>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by borrower name…"
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-background w-full sm:w-44">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter Status" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Clear">Clear</SelectItem>
                <SelectItem value="Temp">Temp</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
              <SelectTrigger className="bg-background w-full sm:w-56">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Sort" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="next-payment-asc">Next Payment (soonest/overdue first)</SelectItem>
                <SelectItem value="date-desc">Date (newest first)</SelectItem>
                <SelectItem value="date-asc">Date (oldest first)</SelectItem>
                <SelectItem value="name-asc">Name (A → Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z → A)</SelectItem>
                <SelectItem value="amount-desc">Amount (high → low)</SelectItem>
                <SelectItem value="amount-asc">Amount (low → high)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !loans || loans.length === 0 ? (
            <EmptyState
              title="No EMI loans found"
              description="Record your first EMI loan to start tracking monthly installments."
              icon={<CalendarClock />}
              action={<Button onClick={() => setIsCreateOpen(true)}>Record EMI Loan</Button>}
            />
          ) : filtered && filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead>Monthly Payment</TableHead>
                  <TableHead>Next Payment</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((loan) => {
                  const isOverdue =
                    loan.nextPaymentDate &&
                    new Date(loan.nextPaymentDate) < now &&
                    loan.status !== "Clear";
                  return (
                    <TableRow key={loan.id} className="group cursor-pointer">
                      <TableCell className="font-medium">{loan.name}</TableCell>
                      <TableCell className="font-numeric">{formatCurrency(loan.principal)}</TableCell>
                      <TableCell className="font-numeric">
                        {loan.monthlyPayment != null ? formatCurrency(loan.monthlyPayment) : "—"}
                      </TableCell>
                      <TableCell className={isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}>
                        {loan.nextPaymentDate ? formatDate(loan.nextPaymentDate) : "—"}
                        {isOverdue && <span className="ml-1 text-xs">(overdue)</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {loan.remainingMonths != null ? `${loan.remainingMonths}mo` : "—"}
                      </TableCell>
                      <TableCell>
                        <EmiStatusBadge status={loan.status} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/emi-loans/${loan.id}`}>
                            <ChevronRight className="h-4 w-4" />
                            <span className="sr-only">View Details</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              {statusFilter !== "all"
                ? <Button variant="outline" onClick={() => setStatusFilter("all")}>Clear Filter</Button>
                : "No EMI loans match your search."}
            </div>
          )}
        </CardContent>
      </Card>

      <EmiLoanFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}
