import {
  useListLoans,
  useUpdateLoan,
  getListLoansQueryKey,
  Loan,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  EmiLoan,
  EMI_LOANS_QUERY_KEY,
  fetchEmiLoans,
} from "@/pages/emi-loans/components/emi-loan-form-dialog";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
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
  CheckSquare,
  CheckCircle2,
  Loader2,
  Archive,
  AlertCircle,
  Clock,
  MessageCircle,
  CalendarRange,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
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
  // Per-row editable paid amounts — keyed by loan id, defaults to finalAmount
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  // Reset amounts whenever loans list changes (dialog re-opens with new selection)
  useEffect(() => {
    const init: Record<string, string> = {};
    loans.forEach((l) => { init[l.id] = String(l.finalAmount ?? 0); });
    setAmounts(init);
  }, [loans]);

  const totalPaid = loans.reduce((s, l) => {
    const v = parseFloat(amounts[l.id] ?? "0");
    return s + (isNaN(v) ? 0 : v);
  }, 0);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await Promise.all(
        loans.map((l) => {
          const paid = parseFloat(amounts[l.id] ?? "0");
          return updateLoan.mutateAsync({
            id: l.id,
            data: {
              status: "Clear",
              paid: isNaN(paid) ? (l.finalAmount ?? 0) : paid,
              dateOfPartPayment: paidDate,
            },
          });
        }),
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
            Edit each amount collected before confirming. Status will be set to Clear.
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

          <div className="rounded-lg border bg-muted/30 divide-y max-h-60 overflow-y-auto">
            {loans.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium truncate block">{l.name}</span>
                  {l.loanId && (
                    <span className="text-xs text-muted-foreground font-mono">{l.loanId}</span>
                  )}
                </div>
                {/* Editable amount */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-28 h-7 text-right text-sm font-numeric px-2"
                    value={amounts[l.id] ?? ""}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [l.id]: e.target.value }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
            <span className="font-semibold text-sm">Total</span>
            <span className="font-bold font-numeric text-lg">
              {formatCurrency(totalPaid)}
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
  const [, setLocation] = useLocation();
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
            <TableHead>Amount</TableHead>
            <TableHead>Tenure / Status</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loans.map((loan) => (
            <TableRow
              key={loan.id}
              className={`group cursor-pointer ${selected.has(loan.id) ? "bg-primary/5" : ""}`}
              onClick={() => setLocation(`/loans/${loan.id}`)}
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
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  <div>{formatDateTime(loan.transactionDate)}</div>
                  {loan.returnDate && (
                    <div className="text-amber-600 dark:text-amber-400">
                      Due {formatDateTime(loan.returnDate)}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="font-numeric">
                <div className="font-medium">{formatCurrency(loan.principal)}</div>
                {loan.finalAmount != null && (
                  <div className="text-xs text-muted-foreground mt-0.5">{formatCurrency(loan.finalAmount)}</div>
                )}
              </TableCell>
              <TableCell>
                <div className="text-sm text-muted-foreground">{loan.tenureDays}d</div>
                <div className="mt-0.5"><LoanStatusBadge status={loan.status} /></div>
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

// ─── EMI Section (for Overdue / Coming Up tabs) ───────────────────────────────

function EmiSection({
  emis,
  kind,
}: {
  emis: EmiLoan[];
  kind: "overdue" | "coming-up";
}) {
  const [, setLocation] = useLocation();
  if (emis.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          EMI Loans
        </span>
        <span className="rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5 text-[10px] font-medium">
          {emis.length}
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border border-violet-100">
        <Table>
          <TableHeader>
            <TableRow className="bg-violet-50/50">
              <TableHead>Borrower</TableHead>
              <TableHead>Monthly</TableHead>
              <TableHead>{kind === "overdue" ? "Overdue" : "Due In"}</TableHead>
              {kind === "overdue" && <TableHead>Late Fees</TableHead>}
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emis.map((e) => {
              const daysLate = e.lateDays ?? 0;
              const diffDays =
                kind === "coming-up" && e.nextPaymentDate
                  ? Math.ceil(
                      (new Date(e.nextPaymentDate).getTime() - Date.now()) /
                        86400000,
                    )
                  : null;
              return (
                <TableRow
                  key={e.id}
                  className="group cursor-pointer"
                  onClick={() => setLocation(`/emi-loans/${e.id}`)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[90px] sm:max-w-none">
                        {e.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 border-violet-200 text-violet-700 bg-violet-50 shrink-0"
                      >
                        EMI
                      </Badge>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      {e.emiId}
                    </div>
                    {e.nextPaymentDate && (
                      <div className="text-[10px] text-muted-foreground/70">
                        {kind === "overdue"
                          ? `Due ${formatDate(e.nextPaymentDate)}`
                          : `Due ${formatDate(e.nextPaymentDate)}`}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-numeric">
                    <div className="font-medium">
                      {e.monthlyPayment != null
                        ? formatCurrency(e.monthlyPayment)
                        : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(e.principal)} principal
                    </div>
                  </TableCell>
                  <TableCell>
                    {kind === "overdue" ? (
                      <span className="text-sm font-medium text-destructive">
                        {daysLate}d late
                      </span>
                    ) : diffDays !== null ? (
                      <span className="text-sm font-medium text-amber-700">
                        {diffDays === 0 ? "Today" : `${diffDays}d`}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {kind === "overdue" && (
                    <TableCell className="font-numeric">
                      {e.lateFees != null && e.lateFees > 0 ? (
                        <span className="text-sm font-medium text-destructive">
                          {formatCurrency(e.lateFees)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell onClick={(ev) => ev.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Link href={`/emi-loans/${e.id}`}>
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
      </div>
    </div>
  );
}

// ─── Main list ────────────────────────────────────────────────────────────────

export default function LoansList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("Pending");
  const [dateRange, setDateRange] = useState<[number, number] | null>(null);
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

  // EMI loans — shown in overdue/coming-up tabs only, not in the Loans tab
  const { data: emiLoans } = useQuery<EmiLoan[]>({
    queryKey: EMI_LOANS_QUERY_KEY,
    queryFn: fetchEmiLoans,
  });

  const now = useMemo(() => new Date(), []);

  // EMI sub-tab data (lateDays is server-computed; nextPaymentDate drives coming-up)
  const overdueEmis = useMemo(
    () =>
      (emiLoans ?? [])
        .filter((e) => e.status === "Pending" && (e.lateDays ?? 0) > 0)
        .sort((a, b) => (b.lateDays ?? 0) - (a.lateDays ?? 0)),
    [emiLoans],
  );

  const comingUpEmis = useMemo(
    () =>
      (emiLoans ?? [])
        .filter((e) => {
          if (e.status !== "Pending") return false;
          if ((e.lateDays ?? 0) > 0) return false;
          if (!e.nextPaymentDate) return false;
          const due = new Date(e.nextPaymentDate);
          const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return diffDays >= 0 && diffDays <= 30;
        })
        .sort((a, b) => {
          const da = a.nextPaymentDate ? new Date(a.nextPaymentDate).getTime() : 0;
          const db = b.nextPaymentDate ? new Date(b.nextPaymentDate).getTime() : 0;
          return da - db;
        }),
    [emiLoans, now],
  );

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

  // Helper: compute repayment/due date timestamp for a loan
  const getLoanDueTs = (l: Loan): number | null => {
    if (l.returnDate) return new Date(l.returnDate).getTime();
    if (l.transactionDate && l.tenureDays) {
      const d = new Date(l.transactionDate);
      d.setDate(d.getDate() + l.tenureDays);
      return d.getTime();
    }
    return null;
  };

  // Date range min/max based on repayment/due date
  const { minLoanTs, maxLoanTs } = useMemo(() => {
    const dates = (allLoans ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((l) => (l.status as any) !== "Archived")
      .map(getLoanDueTs)
      .filter(Boolean) as number[];
    if (dates.length === 0) return { minLoanTs: 0, maxLoanTs: 0 };
    return { minLoanTs: Math.min(...dates), maxLoanTs: Math.max(...dates) };
  }, [allLoans]);

  // Initialise dateRange when data loads
  useEffect(() => {
    if (minLoanTs > 0 && maxLoanTs > 0 && dateRange === null) {
      setDateRange([minLoanTs, maxLoanTs]);
    }
  }, [minLoanTs, maxLoanTs]);

  const effectiveDateRange = dateRange ?? [minLoanTs, maxLoanTs];

  // Main "Loans" tab — sorted by latest input date (transactionDate), excludes archived.
  // "All" does NOT include Clear loans; you must explicitly select "Clear" to see them.
  const filtered = useMemo(
    () =>
      (allLoans ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((l) => (l.status as any) !== "Archived")
        .filter((l) => {
          if (statusFilter === "all") return (l.status as string) !== "Clear";
          return (l.status as string) === statusFilter;
        })
        .filter((l) => l.name.toLowerCase().includes(search.toLowerCase()))
        .filter((l) => {
          if (!dateRange || minLoanTs === maxLoanTs) return true;
          const dueTs = getLoanDueTs(l);
          if (dueTs === null) return true;
          return dueTs >= effectiveDateRange[0] && dueTs <= effectiveDateRange[1];
        })
        .sort((a, b) => {
          // Always sort by latest transaction date first
          const da = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
          const db = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
          return db - da;
        }),
    [allLoans, statusFilter, search, dateRange, effectiveDateRange, minLoanTs, maxLoanTs],
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
    } catch (err) {
      console.error("Archive error:", err);
      toast({
        variant: "destructive",
        title: "Archive failed",
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

  // Reminder helpers
  function sanitizePhone(raw: string): string {
    let digits = raw.replace(/\D/g, "");
    if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
    return digits.slice(-10);
  }
  const selectedPhones = selectedLoans.map((l) =>
    sanitizePhone((l.whatsapp ?? "").split("\n")[0].trim()),
  );
  const uniqueSelectedPhones = new Set(selectedPhones.filter((p) => p.length === 10));
  const canSendReminder = selectedLoans.length > 0 && uniqueSelectedPhones.size === 1;
  const reminderPhone = canSendReminder ? [...uniqueSelectedPhones][0] : null;

  function buildReminderMessage(loans: Loan[]): string {
    const name = loans[0]?.name ?? "Borrower";
    if (loans.length === 1) {
      const l = loans[0];
      const outstanding = Math.max((l.finalAmount ?? 0) - (l.paid ?? 0), 0);
      const dueText =
        (l.lateDays ?? 0) > 0
          ? `overdue by ${l.lateDays} day${l.lateDays !== 1 ? "s" : ""}`
          : l.returnDate
            ? `due on ${formatDate(l.returnDate)}`
            : "due soon";
      return [
        `👋 Hi ${name},`,
        `This is a reminder about your loan payment of ₹${outstanding.toLocaleString("en-IN")} ${dueText}.`,
        l.loanId ? `🔖 Loan ID: ${l.loanId}` : "",
        `Please arrange payment at your earliest convenience. Thank you! 🙏`,
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      const lines = [`👋 Hi ${name},`, `You have ${loans.length} outstanding dues:`];
      loans.forEach((l, i) => {
        const outstanding = Math.max((l.finalAmount ?? 0) - (l.paid ?? 0), 0);
        const status =
          (l.lateDays ?? 0) > 0
            ? `Overdue ${l.lateDays}d`
            : l.returnDate
              ? `Due ${formatDate(l.returnDate)}`
              : "Due soon";
        const idPart = l.loanId ? ` [${l.loanId}]` : "";
        lines.push(`${i + 1}. Loan${idPart}: ₹${outstanding.toLocaleString("en-IN")} — ${status}`);
      });
      const total = loans.reduce((s, l) => s + Math.max((l.finalAmount ?? 0) - (l.paid ?? 0), 0), 0);
      lines.push(`\nTotal: ₹${total.toLocaleString("en-IN")}`);
      lines.push(`Please arrange payment at your earliest convenience. Thank you! 🙏`);
      return lines.join("\n");
    }
  }

  // Only Pending/Temp loans are eligible for archiving.
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
            {canSendReminder && reminderPhone && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const msg = buildReminderMessage(selectedLoans);
                  window.open(
                    `https://wa.me/91${reminderPhone}?text=${encodeURIComponent(msg)}`,
                    "_blank",
                  );
                }}
              >
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                Send Reminder
              </Button>
            )}
            {selectedLoans.length > 0 && !canSendReminder && uniqueSelectedPhones.size > 1 && (
              <Button size="sm" variant="outline" disabled title="Select loans from the same borrower to send a reminder">
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                Send Reminder
              </Button>
            )}
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
        <div className="overflow-x-auto">
          <TabsList className="w-max min-w-full flex-nowrap">
            <TabsTrigger value="overdue" className="shrink-0 gap-1.5 text-xs sm:text-sm px-3">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Overdue
              {(overdueLoans.length + overdueEmis.length) > 0 && (
                <Badge variant="destructive" className="text-xs h-4 px-1">
                  {overdueLoans.length + overdueEmis.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="coming-up" className="shrink-0 gap-1.5 text-xs sm:text-sm px-3">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Coming Up
              {(comingUpLoans.length + comingUpEmis.length) > 0 && (
                <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium">
                  {comingUpLoans.length + comingUpEmis.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="loans" className="shrink-0 gap-1.5 text-xs sm:text-sm px-3">
              <CreditCard className="h-3.5 w-3.5 shrink-0" />
              Loans
            </TabsTrigger>
            <TabsTrigger value="archived" className="shrink-0 gap-1.5 text-xs sm:text-sm px-3">
              <Archive className="h-3.5 w-3.5 shrink-0" />
              Archived
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Overdue Tab */}
        <TabsContent value="overdue" className="mt-4">
          <Card className="shadow-sm border-border/60">
            <CardContent className="pt-4">
              {overdueLoans.length === 0 && overdueEmis.length === 0 ? (
                <EmptyState
                  title="No overdue loans"
                  description="Great — all loans and EMIs are on schedule."
                  icon={<AlertCircle />}
                />
              ) : (
                <>
                  {overdueLoans.length > 0 && (
                    <LoansTable
                      loans={overdueLoans}
                      isLoading={isLoading}
                      selected={selected}
                      onToggle={toggleRow}
                      onToggleAll={toggleAll}
                      emptyTitle="No overdue loans"
                      emptyDescription="Great — all loans are on schedule."
                    />
                  )}
                  <EmiSection emis={overdueEmis} kind="overdue" />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Coming Up Tab */}
        <TabsContent value="coming-up" className="mt-4">
          <Card className="shadow-sm border-border/60">
            <CardContent className="pt-4">
              {comingUpLoans.length === 0 && comingUpEmis.length === 0 ? (
                <EmptyState
                  title="Nothing due soon"
                  description="No loans or EMIs due in the next 30 days."
                  icon={<Clock />}
                />
              ) : (
                <>
                  {comingUpLoans.length > 0 && (
                    <LoansTable
                      loans={comingUpLoans}
                      isLoading={isLoading}
                      selected={selected}
                      onToggle={toggleRow}
                      onToggleAll={toggleAll}
                      emptyTitle="Nothing due soon"
                      emptyDescription="No loans due in the next 30 days."
                    />
                  )}
                  <EmiSection emis={comingUpEmis} kind="coming-up" />
                </>
              )}
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
                  </SelectContent>
                </Select>
              </div>
              {/* Date range slider */}
              {minLoanTs > 0 && maxLoanTs > 0 && minLoanTs !== maxLoanTs && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <CalendarRange className="h-3.5 w-3.5" /> Date Range
                    </span>
                    <button
                      className="text-xs text-muted-foreground underline"
                      onClick={() => setDateRange([minLoanTs, maxLoanTs])}
                    >
                      Reset
                    </button>
                  </div>
                  <Slider
                    min={minLoanTs}
                    max={maxLoanTs}
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
