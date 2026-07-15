import {
  useListLoans,
  useUpdateLoan,
  getListLoansQueryKey,
  LoanStatus,
  Loan,
} from "@workspace/api-client-react";
import { useState } from "react";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { LoanStatusBadge } from "@/components/status-badges";
import {
  Plus,
  Search,
  ChevronRight,
  CreditCard,
  Filter,
  ArrowUpDown,
  CheckSquare,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LoanFormDialog from "./components/loan-form-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type SortField =
  | "due-soonest"
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "amount-desc"
  | "amount-asc";

// ─── Bulk Mark as Paid Dialog ─────────────────────────────────────────────────

function BulkMarkPaidDialog({
  open,
  onOpenChange,
  loans,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loans: Loan[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateLoan = useUpdateLoan();
  const [isPending, setIsPending] = useState(false);
  const [paidDate, setPaidDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const totalFinal = loans.reduce((s, l) => s + (l.finalAmount ?? 0), 0);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await Promise.all(
        loans.map((l) =>
          updateLoan.mutateAsync({
            id: l.id,
            data: {
              status: "Clear",
              paid: l.finalAmount ?? 0,
              dateOfPartPayment: paidDate,
            },
          }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
      toast({
        title: `${loans.length} loan${loans.length !== 1 ? "s" : ""} marked as paid`,
      });
      onDone();
      onOpenChange(false);
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Some loans could not be updated. Please retry.",
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
            Mark {loans.length} Loan{loans.length !== 1 ? "s" : ""} as Paid
          </DialogTitle>
          <DialogDescription>
            This will set status to Clear and record the full final amount as
            paid for each selected loan.
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
                  {l.finalAmount != null ? formatCurrency(l.finalAmount) : "—"}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
            <span className="font-semibold text-sm">Total</span>
            <span className="font-bold font-numeric text-lg">
              {formatCurrency(totalFinal)}
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

// ─── Main list ────────────────────────────────────────────────────────────────

export default function LoansList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("due-soonest");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPaidOpen, setBulkPaidOpen] = useState(false);

  const { data: loans, isLoading } = useListLoans(
    statusFilter !== "all"
      ? { status: statusFilter as LoanStatus }
      : undefined,
    {
      query: {
        queryKey: getListLoansQueryKey(
          statusFilter !== "all"
            ? { status: statusFilter as LoanStatus }
            : undefined,
        ),
      },
    },
  );

  const filtered = loans
    ?.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      switch (sortField) {
        case "due-soonest": {
          const overdueA = a.lateDays ?? 0;
          const overdueB = b.lateDays ?? 0;
          if (overdueA > 0 || overdueB > 0) {
            if (overdueA !== overdueB) return overdueB - overdueA;
          }
          const dueA = a.returnDate
            ? new Date(a.returnDate).getTime()
            : Infinity;
          const dueB = b.returnDate
            ? new Date(b.returnDate).getTime()
            : Infinity;
          return dueA - dueB;
        }
        case "date-desc": {
          const da = a.transactionDate
            ? new Date(a.transactionDate).getTime()
            : 0;
          const db = b.transactionDate
            ? new Date(b.transactionDate).getTime()
            : 0;
          return db - da;
        }
        case "date-asc": {
          const da = a.transactionDate
            ? new Date(a.transactionDate).getTime()
            : 0;
          const db = b.transactionDate
            ? new Date(b.transactionDate).getTime()
            : 0;
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
          <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">
            Loans
          </h1>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="w-full sm:w-auto shadow-sm"
        >
          <Plus className="mr-2 h-4 w-4" /> Record Loan
        </Button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="font-medium">{selected.size} selected</span>
            {pendingSelected.length > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {pendingSelected.length} unpaid
                </span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
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
            <div className="relative flex-1 min-w-[180px]">
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
            <Select
              value={sortField}
              onValueChange={(v) => setSortField(v as SortField)}
            >
              <SelectTrigger className="bg-background w-full sm:w-52">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Sort" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due-soonest">
                  Due Date (overdue first)
                </SelectItem>
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
              description={
                statusFilter !== "all"
                  ? `No loans with status: ${statusFilter}`
                  : "Record your first loan to start tracking."
              }
              icon={<CreditCard />}
              action={
                statusFilter === "all" ? (
                  <Button onClick={() => setIsCreateOpen(true)}>
                    Record Loan
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setStatusFilter("all")}
                  >
                    Clear Filter
                  </Button>
                )
              }
            />
          ) : filtered && filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          filtered.length > 0 &&
                          filtered.every((l) => selected.has(l.id))
                        }
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Tenure
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Final Amount</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((loan) => (
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
                        <div className="text-xs text-muted-foreground font-mono">{loan.loanId}</div>
                      </TableCell>
                      <TableCell className="font-numeric">
                        {formatCurrency(loan.principal)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {loan.tenureDays}d
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {formatDateTime(loan.transactionDate)}
                      </TableCell>
                      <TableCell>
                        <LoanStatusBadge status={loan.status} />
                      </TableCell>
                      <TableCell className="text-right font-numeric font-medium">
                        {loan.finalAmount != null
                          ? formatCurrency(loan.finalAmount)
                          : "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
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
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              No loans match your search.
            </div>
          )}
        </CardContent>
      </Card>

      <LoanFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <BulkMarkPaidDialog
        open={bulkPaidOpen}
        onOpenChange={setBulkPaidOpen}
        loans={pendingSelected}
        onDone={() => setSelected(new Set())}
      />
    </div>
  );
}
