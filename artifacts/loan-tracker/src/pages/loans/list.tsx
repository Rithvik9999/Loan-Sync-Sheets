import { useListLoans, getListLoansQueryKey, LoanStatus } from "@workspace/api-client-react";
import { useState } from "react";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { LoanStatusBadge } from "@/components/status-badges";
import { Plus, Search, ChevronRight, CreditCard, Filter, ArrowUpDown } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LoanFormDialog from "./components/loan-form-dialog";

type SortField = "date-desc" | "date-asc" | "name-asc" | "name-desc" | "amount-desc" | "amount-asc";

export default function LoansList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date-desc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: loans, isLoading } = useListLoans(
    statusFilter !== "all" ? { status: statusFilter as LoanStatus } : undefined,
    {
      query: { queryKey: getListLoansQueryKey(statusFilter !== "all" ? { status: statusFilter as LoanStatus } : undefined) },
    },
  );

  const filtered = loans
    ?.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      switch (sortField) {
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
          return (b.finalAmount ?? 0) - (a.finalAmount ?? 0);
        case "amount-asc":
          return (a.finalAmount ?? 0) - (b.finalAmount ?? 0);
        default:
          return 0;
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">Loans</h1>
          <p className="text-muted-foreground mt-1">Backed live by your Heat Map sheet — fees and totals are computed there.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Record Loan
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
              <SelectTrigger className="bg-background w-full sm:w-52">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Sort" />
                </div>
              </SelectTrigger>
              <SelectContent>
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
              title="No loans found"
              description={statusFilter !== "all" ? `No loans with status: ${statusFilter}` : "Record your first loan to start tracking."}
              icon={<CreditCard />}
              action={
                statusFilter === "all" ? (
                  <Button onClick={() => setIsCreateOpen(true)}>Record Loan</Button>
                ) : (
                  <Button variant="outline" onClick={() => setStatusFilter("all")}>Clear Filter</Button>
                )
              }
            />
          ) : filtered && filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead>Tenure</TableHead>
                  <TableHead>Transaction Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Final Amount</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((loan) => (
                  <TableRow key={loan.id} className="group cursor-pointer">
                    <TableCell className="font-medium">{loan.name}</TableCell>
                    <TableCell className="font-numeric">{formatCurrency(loan.principal)}</TableCell>
                    <TableCell className="text-muted-foreground">{loan.tenureDays}d</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(loan.transactionDate)}</TableCell>
                    <TableCell>
                      <LoanStatusBadge status={loan.status} />
                    </TableCell>
                    <TableCell className="text-right font-numeric font-medium">
                      {loan.finalAmount != null ? formatCurrency(loan.finalAmount) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/loans/${loan.id}`}>
                          <ChevronRight className="h-4 w-4" />
                          <span className="sr-only">View Details</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              No loans match your search.
            </div>
          )}
        </CardContent>
      </Card>

      <LoanFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}
