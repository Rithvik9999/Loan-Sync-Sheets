import {
  useListLoans,
  useUpdateLoan,
  getListLoansQueryKey,
  Loan,
} from "@workspace/api-client-react";
import { useState, useMemo } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Archive,
  AlertCircle,
  Clock,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
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
import { Badge } from "@/components/ui/badge";
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
                <div>
                  <span className="font-medium truncate">{l.name}</span>
                  {l.loanId && (
                    <span className="ml-2 text-xs text-muted-foreground font-mono">{l.loanId}</span>
                  )}
                </div>
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

// ─── Shared Loans Table ───────────────────────────────────────────────────────

function LoansTable({
  loans,
  isLoading,
  selected,
  onToggle,
  onToggleAll,
  emptyTitle,
  emptyDescription,
  onCreateLoan,
}: {
  loans: Loan[] | undefined;
  isLoading: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  emptyTitle: string;
  emptyDescription: string;
  onCreateLoan?: () => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (!loans || loans.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={<CreditCard />}
        action={
          onCreateLoan ? (
            <Button onClick={onCreateLoan}>Record Loan</Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={loans.length > 0 && loans.every((l) => selected.has(l.id))}
                onCheckedChange={onToggleAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>Borrower</TableHead>
            <TableHead>Principal</TableHead>
            <TableHead className="hidden sm:table-cell">Tenure</TableHead>
            <TableHead className="hidden md:table-cell whitespace-nowrap">Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Final Amount</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loans.map((loan) => (
            <TableRow
              key={loan.id}
              className={`group cursor-pointer ${selected.has(loan.id) ? "bg-primary/5" : ""}`}
              onClick={() => onToggle(loan.id)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selected.has(loan.id)}
                  onCheckedChange={() => onToggle(loan.id)}
                  aria-label={`Select ${loan.name}`}
                />
              </TableCell>
              <TableCell className="font-medium">
                <div className="truncate max-w-[100px] sm:max-w-none">{loan.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{loan.loanId}</div>
              </TableCell>
              <TableCell className="font-numeric">
                {formatCurrency(loan.principal)}
              </TableCell>
              <TableCell className="text-muted-foreground hidden sm:table-cell">
                {loan.tenureDays}d
              </TableCell>
              <TableCell className="text-muted-foreground hidden md:table-cell whitespace-nowrap text-xs">
                {formatDate(loan.transactionDate)}
              </TableCell>
              <TableCell>
                <LoanStatusBadge status={loan.status} />
              </TableCell>
              <TableCell className="text-right font-numeric font-medium">
                {loan.finalAmount != null ? formatCurrency(loan.finalAmount) : "—"}
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
  const [isArchiving, setIsArchiving] = useState(false);
  const [activeTab, setActiveTab] = useState("loans");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateLoan = useUpdateLoan();

  // Always fetch all loans; filter client-side for sub-tabs
  const { data: allLoans, isLoading } = useListLoans(undefined, {
    query: { queryKey: getListLoansQueryKey() },
  });

  const now = useMemo(() => new Date(), []);

  // Sub-tab data
  const overdueLoans = useMemo(
    () =>
      (allLoans ?? [])
        .filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (l) => (l.lateDays ?? 0) > 0 && l.status !== "Clear" && (l.status as any) !== "Archived",
        )
        .sort((a, b) => (b.lateDays ?? 0) - (a.lateDays ?? 0)),
    [allLoans],
  );

  const comingUpLoans = useMemo(
    () =>
      (allLoans ?? [])
        .filter((l) => {
          if (l.status !== "Pending") return false;
          if ((l.lateDays ?? 0) > 0) return false;
          if (!l.returnDate) return false;
          const due = new Date(l.returnDate);
          const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return diffDays >= 0 && diffDays <= 30;
        })
        .sort((a, b) => {
          const da = a.returnDate ? new Date(a.returnDate).getTime() : 0;
          const db = b.returnDate ? new Date(b.returnDate).getTime() : 0;
          return da - db;
        }),
    [allLoans, now],
  );

  const archivedLoans = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (allLoans ?? []).filter((l) => (l.status as any) === "Archived"),
    [allLoans],
  );

  // Main "Loans" tab filtered list (excludes archived)
  const filtered = useMemo(
    () =>
      (allLoans ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((l) => (l.status as any) !== "Archived")
        .filter(
          (l) =>
            statusFilter === "all" ||
            (l.status as string) === statusFilter,
        )
        .filter((l) => l.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => {
          switch (sortField) {
            case "due-soonest": {
              const overdueA = a.lateDays ?? 0;
              const overdueB = b.lateDays ?? 0;
              if (overdueA > 0 || overdueB > 0) {
                if (overdueA !== overdueB) return overdueB - overdueA;
              }
              const dueA = a.returnDate ? new Date(a.returnDate).getTime() : Infinity;
              const dueB = b.returnDate ? new Date(b.returnDate).getTime() : Infinity;
              return dueA - dueB;
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
              return (b.finalAmount ?? 0) - (a.finalAmount ?? 0);
            case "amount-asc":
              return (a.finalAmount ?? 0) - (b.finalAmount ?? 0);
            default:
              return 0;
          }
        }),
    [allLoans, statusFilter, search, sortField],
  );

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const currentList =
      activeTab === "overdue"
        ? overdueLoans
        : activeTab === "coming-up"
          ? comingUpLoans
          : activeTab === "archived"
            ? archivedLoans
            : filtered ?? [];
    const ids = currentList.map((l) => l.id);
    const allSel = ids.every((id) => selected.has(id));
    setSelected(allSel ? new Set() : new Set(ids));
  };

  const handleArchive = async () => {
    // Only archive Pending/Temp loans; Clear loans must not be archived because
    // restore unconditionally resets to Pending, which would make a paid loan
    // appear outstanding again — a serious data integrity issue.
    const ids = archivableSelected.map((l) => l.id);
    if (ids.length === 0) return;
    setIsArchiving(true);
    try {
      await Promise.all(
        ids.map((id) =>
          updateLoan.mutateAsync({ id, data: { status: "Archived" as any } }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
      toast({ title: `${ids.length} loan${ids.length !== 1 ? "s" : ""} archived` });
      setSelected(new Set());
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not archive loans. Please retry.",
      });
    } finally {
      setIsArchiving(false);
    }
  };

  const handleUnarchive = async (ids: string[]) => {
    try {
      await Promise.all(
        ids.map((id) =>
          updateLoan.mutateAsync({ id, data: { status: "Pending" } }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
      toast({ title: `${ids.length} loan${ids.length !== 1 ? "s" : ""} restored` });
      setSelected(new Set());
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not restore loans." });
    }
  };

  const selectedLoans = [...selected]
    .map((id) => (allLoans ?? []).find((l) => l.id === id))
    .filter(Boolean) as Loan[];

  // Only Pending/Temp loans are eligible for archiving.
  // Clear (paid) loans must NOT be archived: restoring would reset them to Pending,
  // making a paid loan appear outstanding again — a serious data integrity issue.
  const archivableSelected = selectedLoans.filter(
    (l) => l.status === "Pending" || l.status === "Temp",
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const archivedSelected = selectedLoans.filter((l) => (l.status as any) === "Archived");
  // For "Mark as Paid": all non-Clear, non-Archived selected loans
  const pendingSelected = selectedLoans.filter(
    (l) => l.status !== "Clear" && (l.status as any) !== "Archived",
  );

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)} className="shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Record Loan
        </Button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="font-medium">{selected.size} selected</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            {activeTab === "archived" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUnarchive([...selected])}
                disabled={isArchiving}
              >
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                Restore {selected.size}
              </Button>
            ) : (
              <>
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
                {archivableSelected.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleArchive}
                    disabled={isArchiving}
                    title="Only Pending/Temp loans can be archived"
                  >
                    {isArchiving ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Archive className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Archive {archivableSelected.length}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v);
          setSelected(new Set());
        }}
      >
        <TabsList className="w-full overflow-x-auto flex-nowrap">
          <TabsTrigger value="overdue" className="flex-1 gap-1.5 text-xs sm:text-sm">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Overdue
            {overdueLoans.length > 0 && (
              <Badge variant="destructive" className="text-xs h-4 px-1">
                {overdueLoans.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="coming-up" className="flex-1 gap-1.5 text-xs sm:text-sm">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Coming Up
            {comingUpLoans.length > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium">
                {comingUpLoans.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="loans" className="flex-1 gap-1.5 text-xs sm:text-sm">
            <CreditCard className="h-3.5 w-3.5 shrink-0" />
            Loans
          </TabsTrigger>
          <TabsTrigger value="archived" className="flex-1 gap-1.5 text-xs sm:text-sm">
            <Archive className="h-3.5 w-3.5 shrink-0" />
            Archived
          </TabsTrigger>
        </TabsList>

        {/* Overdue Tab */}
        <TabsContent value="overdue" className="mt-4">
          <Card className="shadow-sm border-border/60">
            <CardContent className="pt-4">
              <LoansTable
                loans={overdueLoans}
                isLoading={isLoading}
                selected={selected}
                onToggle={toggleRow}
                onToggleAll={toggleAll}
                emptyTitle="No overdue loans"
                emptyDescription="Great — all loans are on schedule."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Coming Up Tab */}
        <TabsContent value="coming-up" className="mt-4">
          <Card className="shadow-sm border-border/60">
            <CardContent className="pt-4">
              <LoansTable
                loans={comingUpLoans}
                isLoading={isLoading}
                selected={selected}
                onToggle={toggleRow}
                onToggleAll={toggleAll}
                emptyTitle="Nothing due soon"
                emptyDescription="No loans due in the next 30 days."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Loans Tab */}
        <TabsContent value="loans" className="mt-4">
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
                  <SelectTrigger className="bg-background w-full sm:w-44 gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="All Statuses" />
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
                  <SelectTrigger className="bg-background w-full sm:w-52 gap-2">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Sort by…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due-soonest">Due Date (overdue first)</SelectItem>
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
              {filtered && filtered.length > 0 ? (
                <LoansTable
                  loans={filtered}
                  isLoading={isLoading}
                  selected={selected}
                  onToggle={toggleRow}
                  onToggleAll={toggleAll}
                  emptyTitle="No loans found"
                  emptyDescription={
                    statusFilter !== "all"
                      ? `No loans with status: ${statusFilter}`
                      : "Record your first loan to start tracking."
                  }
                  onCreateLoan={
                    statusFilter === "all" ? () => setIsCreateOpen(true) : undefined
                  }
                />
              ) : isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !allLoans || (allLoans.filter(l => l.status !== ("Archived" as any)).length === 0) ? (
                <EmptyState
                  title="No loans found"
                  description="Record your first loan to start tracking."
                  icon={<CreditCard />}
                  action={<Button onClick={() => setIsCreateOpen(true)}>Record Loan</Button>}
                />
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  No loans match your filters.{" "}
                  {statusFilter !== "all" && (
                    <button
                      className="underline"
                      onClick={() => setStatusFilter("all")}
                    >
                      Clear filter
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Archived Tab */}
        <TabsContent value="archived" className="mt-4">
          <Card className="shadow-sm border-border/60">
            <CardContent className="pt-4">
              <LoansTable
                loans={archivedLoans}
                isLoading={isLoading}
                selected={selected}
                onToggle={toggleRow}
                onToggleAll={toggleAll}
                emptyTitle="No archived loans"
                emptyDescription="Archived loans will appear here."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
