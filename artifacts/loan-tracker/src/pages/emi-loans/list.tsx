import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
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
import { Plus, Search, ChevronRight, CalendarClock, CheckSquare, CheckCircle2, Loader2, CalendarRange, Banknote, Archive } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import EmiLoanFormDialog, { EmiLoan, EMI_LOANS_QUERY_KEY, fetchEmiLoans, markEmiLoanMonthlyPaid } from "./components/emi-loan-form-dialog";

function EmiStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "Pending":
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Pending</Badge>;
    case "Clear":
      return <Badge variant="success">Clear</Badge>;
    case "Temp":
      return <Badge variant="outline" className="border-amber-200 text-amber-800 bg-amber-50">Temp</Badge>;
    case "Archived":
      return <Badge variant="outline" className="border-slate-300 text-slate-500 bg-slate-50">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

async function archiveEmiLoan(id: string): Promise<void> {
  const res = await fetch(`/api/emi-loans/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Archived" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error || "Failed to archive EMI loan");
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
      await Promise.all(loans.map((l) => markEmiLoanMonthlyPaid(l.emiId ?? l.id, paidDate)));
      queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
      toast({
        title: `${loans.length} EMI payment${loans.length !== 1 ? "s" : ""} recorded`,
        description: "Month advanced, next due date updated.",
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
            Marks one monthly payment as paid for each selected EMI. The loan advances to the next month — status is set to Clear only when all months are repaid.
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

// ─── Per-row Record Payment Dialog ────────────────────────────────────────────

function RecordEmiPaymentInlineDialog({
  loan,
  open,
  onOpenChange,
}: {
  loan: EmiLoan;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(loan.monthlyPayment ?? ""));
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [markClear, setMarkClear] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Reset when loan changes
  useEffect(() => {
    setAmount(String(loan.monthlyPayment ?? ""));
    setDate(format(new Date(), "yyyy-MM-dd"));
    setMarkClear(false);
  }, [loan.id]);

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Please enter a valid amount." });
      return;
    }
    setIsPending(true);
    try {
      const emiKey = loan.emiId ?? loan.id;
      if (markClear) {
        const res = await fetch(`/api/emi-loans/${emiKey}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Clear" }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
      } else {
        const res = await fetch(`/api/emi-loans/${emiKey}/pay`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paidDate: date, paidAmount: amt }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
      }
      queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
      toast({
        title: markClear ? "Marked as Clear" : "Payment recorded",
        description: markClear
          ? `${loan.name} is now fully cleared.`
          : `₹${amt.toLocaleString("en-IN")} recorded on ${date}.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment — {loan.name}</DialogTitle>
          <DialogDescription>
            Enter any amount for daily, weekly, or monthly payments.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Amount Paid (₹)</label>
            <Input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(loan.monthlyPayment ?? 0)}
            />
            {loan.monthlyPayment != null && (
              <p className="text-xs text-muted-foreground">
                Standard monthly: ₹{Math.round(loan.monthlyPayment).toLocaleString("en-IN")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Payment Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <input
              id={`clear-${loan.id}`}
              type="checkbox"
              checked={markClear}
              onChange={(e) => setMarkClear(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <label htmlFor={`clear-${loan.id}`} className="text-xs text-amber-900 cursor-pointer">
              Mark loan as <strong>fully cleared</strong>
            </label>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className={markClear ? "bg-emerald-700 hover:bg-emerald-800 text-white" : ""}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {markClear ? "Mark as Clear" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EmiLoansList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("Pending");
  const [dateRange, setDateRange] = useState<[number, number] | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPaidOpen, setBulkPaidOpen] = useState(false);
  const [bulkArchivePending, setBulkArchivePending] = useState(false);
  const [payLoan, setPayLoan] = useState<EmiLoan | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: loans, isLoading } = useQuery<EmiLoan[]>({
    queryKey: EMI_LOANS_QUERY_KEY,
    queryFn: fetchEmiLoans,
  });

  const now = new Date();

  // Date range min/max based on next payment date (repayment date)
  const { minEmiTs, maxEmiTs } = useMemo(() => {
    const dates = (loans ?? [])
      .map((l) => (l.nextPaymentDate ? new Date(l.nextPaymentDate).getTime() : null))
      .filter(Boolean) as number[];
    if (dates.length === 0) return { minEmiTs: 0, maxEmiTs: 0 };
    return { minEmiTs: Math.min(...dates), maxEmiTs: Math.max(...dates) };
  }, [loans]);

  // Initialise dateRange when data loads
  useEffect(() => {
    if (minEmiTs > 0 && maxEmiTs > 0 && dateRange === null) {
      setDateRange([minEmiTs, maxEmiTs]);
    }
  }, [minEmiTs, maxEmiTs]);

  const effectiveDateRange = dateRange ?? [minEmiTs, maxEmiTs];

  // Sort by latest transaction date (newest first), no sort dropdown.
  // "All" excludes Clear loans; you must explicitly select "Clear" to see them.
  const filtered = useMemo(
    () =>
      (loans ?? [])
        .filter((l) => {
          const nameMatch = l.name.toLowerCase().includes(search.toLowerCase());
          const statusMatch =
            statusFilter === "all"
              ? l.status !== "Clear" && l.status !== "Archived"
              : l.status === statusFilter;
          return nameMatch && statusMatch;
        })
        .filter((l) => {
          if (!dateRange || minEmiTs === maxEmiTs) return true;
          if (!l.nextPaymentDate) return true;
          const ts = new Date(l.nextPaymentDate).getTime();
          return ts >= effectiveDateRange[0] && ts <= effectiveDateRange[1];
        })
        .sort((a, b) => {
          const da = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
          const db = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
          return db - da;
        }),
    [loans, search, statusFilter, dateRange, effectiveDateRange, minEmiTs, maxEmiTs],
  );

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!filtered) return;
    const ids = filtered.map((l) => l.emiId ?? l.id);
    const allSelected = ids.every((id) => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ids));
    }
  };

  const [, setLocation] = useLocation();
  const selectedLoans = (filtered ?? []).filter((l) => selected.has(l.emiId ?? l.id));
  const pendingSelected = selectedLoans.filter((l) => l.status !== "Clear" && l.status !== "Archived");
  const archivableSelected = selectedLoans.filter((l) => l.status !== "Clear" && l.status !== "Archived");

  const handleBulkArchive = async () => {
    if (archivableSelected.length === 0) return;
    setBulkArchivePending(true);
    try {
      await Promise.all(archivableSelected.map((l) => archiveEmiLoan(l.emiId ?? l.id)));
      queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
      toast({
        title: `${archivableSelected.length} EMI loan${archivableSelected.length !== 1 ? "s" : ""} archived`,
        description: "Archived loans are hidden from the active list. Use the Archived filter to view them.",
      });
      setSelected(new Set());
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Some loans could not be archived. Please retry." });
    } finally {
      setBulkArchivePending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div />
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
            {archivableSelected.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-slate-400 text-slate-700 hover:bg-slate-50"
                onClick={handleBulkArchive}
                disabled={bulkArchivePending}
              >
                {bulkArchivePending
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Archive className="mr-1.5 h-3.5 w-3.5" />}
                Archive {archivableSelected.length}
              </Button>
            )}
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
                <SelectValue>
                  {statusFilter === "all" ? "All (excl. Cleared)" : (statusFilter || "Filter")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All (excl. Cleared)</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Temp">Temp</SelectItem>
                <SelectItem value="Clear">Clear</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Date range slider */}
          {minEmiTs > 0 && maxEmiTs > 0 && minEmiTs !== maxEmiTs && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <CalendarRange className="h-3.5 w-3.5" /> Date Range
                </span>
                <button
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setDateRange([minEmiTs, maxEmiTs])}
                >
                  Reset
                </button>
              </div>
              <Slider
                min={minEmiTs}
                max={maxEmiTs}
                step={86400000}
                value={effectiveDateRange}
                onValueChange={(v) => setDateRange([v[0], v[1]])}
                className="w-full"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{new Date(effectiveDateRange[0]).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                <span>{new Date(effectiveDateRange[1]).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
            </div>
          )}
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
                      checked={filtered.length > 0 && filtered.every((l) => selected.has(l.emiId ?? l.id))}
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
                      className={`group cursor-pointer ${selected.has(loan.emiId ?? loan.id) ? "bg-primary/5" : ""}`}
                      onClick={() => setLocation(`/emi-loans/${loan.emiId ?? loan.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(loan.emiId ?? loan.id)}
                          onCheckedChange={() => toggleRow(loan.emiId ?? loan.id)}
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
                      <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {loan.status !== "Clear" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Record Payment"
                              onClick={(e) => { e.stopPropagation(); setPayLoan(loan); }}
                            >
                              <Banknote className="h-4 w-4 text-emerald-700" />
                              <span className="sr-only">Record Payment</span>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/emi-loans/${loan.emiId ?? loan.id}`}>
                              <ChevronRight className="h-4 w-4" />
                              <span className="sr-only">View Details</span>
                            </Link>
                          </Button>
                        </div>
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

      {payLoan && (
        <RecordEmiPaymentInlineDialog
          loan={payLoan}
          open={!!payLoan}
          onOpenChange={(v) => { if (!v) setPayLoan(null); }}
        />
      )}
    </div>
  );
}
