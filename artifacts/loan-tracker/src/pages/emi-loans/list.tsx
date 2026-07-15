import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, ChevronRight, CalendarClock, Filter, ArrowUpDown, CheckSquare, CheckCircle2, Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import EmiLoanFormDialog, { EmiLoan, EMI_LOANS_QUERY_KEY, fetchEmiLoans, updateEmiLoan } from "./components/emi-loan-form-dialog";

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

// ─── Bulk Mark as Paid Dialog ─────────────────────────────────────────────────

function BulkMarkPaidDialog({
  open,
  onOpenChange,
  loans,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loans: EmiLoan[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [paidDate, setPaidDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const totalMonthly = loans.reduce((s, l) => s + (l.monthlyPayment ?? 0), 0);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await Promise.all(
        loans.map((l) =>
          updateEmiLoan(l.id, {
            status: "Clear",
            statusNotes: `Marked as paid in full on ${paidDate}`,
          }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
      toast({
        title: `${loans.length} EMI loan${loans.length !== 1 ? "s" : ""} marked as paid`,
      });
      onDone();
      onOpenChange(false);
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Some EMI loans could not be updated. Please retry.",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            Mark {loans.length} EMI Loan{loans.length !== 1 ? "s" : ""} as Paid
          </DialogTitle>
          <DialogDescription>
            This will set status to Clear for each selected EMI loan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Date Paid</label>
            <Input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 divide-y max-h-52 overflow-y-auto">
            {loans.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span className="font-medium truncate">{l.name}</span>
                <span className="font-numeric font-semibold shrink-0 ml-3">
                  {l.monthlyPayment != null ? formatCurrency(l.monthlyPayment) : "—"}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
            <span className="font-semibold text-sm">Total (monthly)</span>
            <span className="font-bold font-numeric text-lg">
              {formatCurrency(totalMonthly)}
            </span>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Confirm Mark as Paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EmiLoansList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("next-payment-asc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPaidOpen, setBulkPaidOpen] = useState(false);

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

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!filtered) return;
    const ids = filtered.map((l) => l.id);
    const allSelected = ids.every((id) => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ids));
    }
  };

  const selectedLoans = (filtered ?? []).filter((l) => selected.has(l.id));
  const pendingSelected = selectedLoans.filter((l) => l.status !== "Clear");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">EMI Loans</h1>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Record EMI Loan
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="font-medium">{selected.size} selected</span>
            {pendingSelected.length > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{pendingSelected.length} unpaid</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            {pendingSelected.length > 0 && (
              <Button
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={() => setBulkPaidOpen(true)}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                Mark {pendingSelected.length} as Paid
              </Button>
            )}
          </div>
        </div>
      )}

      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every((l) => selected.has(l.id))}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
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
                    <TableRow
                      key={loan.id}
                      className={`group cursor-pointer ${selected.has(loan.id) ? "bg-primary/5" : ""}`}
                      onClick={() => toggleRow(loan.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(loan.id)}
                          onCheckedChange={() => toggleRow(loan.id)}
                          aria-label={`Select ${loan.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{loan.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{loan.emiId}</div>
                      </TableCell>
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
                      <TableCell onClick={(e) => e.stopPropagation()}>
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

      <BulkMarkPaidDialog
        open={bulkPaidOpen}
        onOpenChange={setBulkPaidOpen}
        loans={pendingSelected}
        onDone={() => setSelected(new Set())}
      />
    </div>
  );
}
