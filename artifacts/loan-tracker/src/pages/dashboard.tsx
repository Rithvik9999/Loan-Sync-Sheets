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
  Banknote,
  XCircle,
  AlertTriangle,
  CalendarClock,
  Loader2,
} from "lucide-react";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoanStatusBadge } from "@/components/status-badges";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEmiLoans, EmiLoan, markEmiLoanMonthlyPaid, EMI_LOANS_QUERY_KEY, parsePayAmountsFromNotes } from "./emi-loans/components/emi-loan-form-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { differenceInCalendarDays, format as dateFnsFormat } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// ─── Admin Collection Popup ───────────────────────────────────────────────────

/** Dismissed flag resets on hard page reload (module re-evaluation). */
let adminPopupDismissedThisLoad = false;

type AdminItemFrequency = "daily" | "weekly" | "bimonthly" | "monthly";
type AdminItemUrgency = "overdue" | "upcoming";

interface AdminCollectionItem {
  key: string;
  loan: EmiLoan;
  name: string;
  frequency: AdminItemFrequency;
  amountDue: number;
  urgency: AdminItemUrgency;
  dueDate: Date | null;
}

function detectEmiFrequency(loan: EmiLoan): { frequency: AdminItemFrequency; amountDue: number } {
  // Priority for FREQUENCY: sheet column → notes regex → paidDates tags (legacy).
  // Priority for AMOUNT: notes-explicit > column value > computed fallback.
  //
  // Notes-explicit amount wins over the column value because the column can be set to
  // a sentinel "1" to mark the loan type without encoding the real instalment amount.
  // parsePayAmountsFromNotes extracts the number from "pay daily NNN" / "pay weekly NNN".
  const paidDates = loan.paidDates ?? [];
  const mp = loan.monthlyPayment ?? 0;
  const notesAmts = parsePayAmountsFromNotes(loan.notes);

  // 1. Column flags determine frequency; notes-extracted amount takes precedence for value.
  if (loan.dailyAmount != null && loan.dailyAmount > 0)
    return { frequency: "daily", amountDue: notesAmts.daily ?? loan.dailyAmount };
  if (loan.weeklyAmount != null && loan.weeklyAmount > 0)
    return { frequency: "weekly", amountDue: notesAmts.weekly ?? loan.weeklyAmount };
  if (loan.bimonthlyAmount != null && loan.bimonthlyAmount > 0) {
    const bm = (loan.notes ?? "").match(/pay\s+bi-?monthly\s+(\d+)/i);
    return { frequency: "bimonthly", amountDue: bm ? Number(bm[1]) : loan.bimonthlyAmount };
  }

  // 2. Notes with explicit amount (column is absent — amount comes entirely from text).
  if (notesAmts.daily != null) return { frequency: "daily", amountDue: notesAmts.daily };
  if (notesAmts.weekly != null) return { frequency: "weekly", amountDue: notesAmts.weekly };
  const bmNotes = (loan.notes ?? "").match(/pay\s+bi-?monthly\s+(\d+)/i);
  if (bmNotes) return { frequency: "bimonthly", amountDue: Number(bmNotes[1]) };

  // 3. paidDates tags (legacy fallback, lowest priority — no explicit amount available).
  if (paidDates.some(e => { const t = e.split(":")[2]; return t === "BM" || t === "BMM"; }))
    return { frequency: "bimonthly", amountDue: Math.round(mp / 2) };
  if (paidDates.some(e => { const t = e.split(":")[2]; return t === "W" || t === "WM"; }))
    return { frequency: "weekly", amountDue: Math.round(mp / 4) };
  if (paidDates.some(e => { const t = e.split(":")[2]; return t === "D" || t === "DM"; }))
    return { frequency: "daily", amountDue: Math.round(mp / 30) };

  return { frequency: "monthly", amountDue: mp };
}

function buildAdminCollectionItems(emiLoans: EmiLoan[]): AdminCollectionItem[] {
  const todayStr = dateFnsFormat(new Date(), "yyyy-MM-dd");
  const now = new Date();
  const items: AdminCollectionItem[] = [];

  for (const loan of emiLoans) {
    if (loan.status !== "Pending") continue;
    const { frequency, amountDue } = detectEmiFrequency(loan);

    // Daily: skip only if a "D" or "DM" type instalment was already recorded today.
    // A monthly "M" entry from today (e.g. first-payment date) must NOT suppress the
    // daily loan — that would be a false "already collected" signal.
    if (frequency === "daily") {
      const alreadyPaidToday = (loan.paidDates ?? []).some(e => {
        if (!e.startsWith(todayStr + ":")) return false;
        const type = e.split(":")[2] ?? "M";
        return type === "D" || type === "DM";
      });
      if (alreadyPaidToday) continue;
    }

    const nextDate = loan.nextPaymentDate ? new Date(loan.nextPaymentDate) : null;
    const isOverdue = (loan.lateDays ?? 0) > 0;

    let urgency: AdminItemUrgency;
    if (isOverdue) {
      urgency = "overdue";
    } else if (frequency === "daily") {
      // Daily loans always need collection today (if not already paid above).
      urgency = "today";
    } else if (nextDate) {
      const daysUntil = differenceInCalendarDays(nextDate, now);
      // Show due-today as "today", everything future as "upcoming" — no upper limit.
      // Removing the 7-day cap ensures loans due later in the month still appear.
      urgency = daysUntil <= 0 ? "today" : "upcoming";
    } else {
      // No nextPaymentDate and not overdue → still include as upcoming so it's visible.
      urgency = "upcoming";
    }

    items.push({ key: loan.emiId ?? loan.id, loan, name: loan.name, frequency, amountDue, urgency, dueDate: nextDate });
  }

  const urgencyOrder: Record<AdminItemUrgency, number> = { overdue: 0, today: 1, upcoming: 2 };
  return items.sort((a, b) => {
    if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    return (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0);
  });
}

const FREQ_LABELS: Record<AdminItemFrequency, string> = {
  daily: "Daily", weekly: "Weekly", bimonthly: "Bi-monthly", monthly: "Monthly",
};
const FREQ_COLORS: Record<AdminItemFrequency, string> = {
  daily: "bg-sky-100 text-sky-800",
  weekly: "bg-violet-100 text-violet-800",
  bimonthly: "bg-indigo-100 text-indigo-800",
  monthly: "bg-slate-100 text-slate-700",
};

async function recordAdminPayment(item: AdminCollectionItem, date: string): Promise<void> {
  const loanKey = item.loan.emiId ?? item.loan.id;
  if (item.frequency === "monthly") {
    await markEmiLoanMonthlyPaid(loanKey, date, item.amountDue);
  } else {
    const res = await fetch(`/api/emi-loans/${loanKey}/pay-partial`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paidDate: date, paidAmount: item.amountDue }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed" }));
      throw new Error(err.error || "Failed to record payment");
    }
  }
}

function AdminPayDialog({
  item, open, onOpenChange, onDone,
}: {
  item: AdminCollectionItem; open: boolean;
  onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(dateFnsFormat(new Date(), "yyyy-MM-dd"));
  const [isPending, setIsPending] = useState(false);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await recordAdminPayment(item, date);
      queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
      toast({ title: "Payment recorded", description: `${item.name} — ₹${item.amountDue.toLocaleString("en-IN")} on ${date}` });
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed." });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>{item.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between rounded-lg bg-muted/40 border px-4 py-3">
            <span className="text-sm text-muted-foreground">{FREQ_LABELS[item.frequency]} payment</span>
            <span className="font-bold font-numeric text-lg">₹{item.amountDue.toLocaleString("en-IN")}</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={handleConfirm} disabled={isPending || !date}>
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Collect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminBulkPayDialog({
  items, open, onOpenChange, onDone,
}: {
  items: AdminCollectionItem[]; open: boolean;
  onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(dateFnsFormat(new Date(), "yyyy-MM-dd"));
  const [isPending, setIsPending] = useState(false);
  const total = items.reduce((s, i) => s + i.amountDue, 0);

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await Promise.all(items.map(item => recordAdminPayment(item, date)));
      queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
      toast({
        title: `${items.length} payment${items.length !== 1 ? "s" : ""} recorded`,
        description: `Total ₹${total.toLocaleString("en-IN")} collected on ${date}.`,
      });
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Some payments failed. Please retry." });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Collect {items.length} Payment{items.length !== 1 ? "s" : ""}</DialogTitle>
          <DialogDescription>
            Records a payment for each selected EMI loan. Daily / weekly / bi-monthly use pay-partial; monthly advances to the next instalment month.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="rounded-lg border bg-muted/30 divide-y max-h-48 overflow-y-auto">
            {items.map(item => (
              <div key={item.key} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium truncate block">{item.name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${FREQ_COLORS[item.frequency]}`}>
                    {FREQ_LABELS[item.frequency]}
                  </span>
                </div>
                <span className="font-numeric font-semibold shrink-0 ml-3">₹{item.amountDue.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
            <span className="font-semibold text-sm">Total</span>
            <span className="font-bold font-numeric text-lg">₹{total.toLocaleString("en-IN")}</span>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
            onClick={handleConfirm}
            disabled={isPending || !date || items.length === 0}
          >
            {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Banknote className="mr-1.5 h-4 w-4" />}
            Collect All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminCollectionPopup({ items }: { items: AdminCollectionItem[] }) {
  const [dismissed, setDismissed] = useState(() => adminPopupDismissedThisLoad);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payItem, setPayItem] = useState<AdminCollectionItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  if (dismissed || items.length === 0) return null;

  const dismiss = () => { adminPopupDismissedThisLoad = true; setDismissed(true); };

  const toggle = (key: string) =>
    setSelected(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  const allSelected = items.length > 0 && items.every(i => selected.has(i.key));
  const selectedItems = items.filter(i => selected.has(i.key));
  const hasOverdue = items.some(i => i.urgency === "overdue");

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={dismiss} />

      {/* Popup card */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "85dvh" }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${hasOverdue ? "bg-destructive/5" : "bg-amber-50"}`}>
          <div className="flex items-center gap-2">
            <CalendarClock className={`h-4 w-4 shrink-0 ${hasOverdue ? "text-destructive" : "text-amber-600"}`} />
            <span className="font-semibold text-sm">Today's Collections</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${hasOverdue ? "bg-destructive text-white" : "bg-amber-200 text-amber-800"}`}>
              {items.length}
            </span>
          </div>
          <button
            onClick={dismiss}
            className="rounded-full p-1.5 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        {/* Section labels + items */}
        <div className="overflow-y-auto flex-1 divide-y divide-border/40">
          {(["overdue", "today", "upcoming"] as AdminItemUrgency[]).map(section => {
            const sectionItems = items.filter(i => i.urgency === section);
            if (sectionItems.length === 0) return null;
            const sectionLabel = section === "overdue" ? "Overdue" : section === "today" ? "Due Today" : "Upcoming (7 days)";
            const sectionColor = section === "overdue"
              ? "bg-destructive/10 text-destructive"
              : section === "today"
              ? "bg-amber-100 text-amber-800"
              : "bg-blue-50 text-blue-700";
            return (
              <div key={section}>
                <div className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${sectionColor}`}>
                  {sectionLabel}
                </div>
                {sectionItems.map(item => (
                  <div
                    key={item.key}
                    className={`flex items-center gap-3 px-3 py-2.5 border-t border-border/30 ${
                      section === "overdue" ? "bg-destructive/[0.03]" : section === "today" ? "bg-amber-50/30" : "bg-blue-50/10"
                    }`}
                  >
                    <Checkbox
                      checked={selected.has(item.key)}
                      onCheckedChange={() => toggle(item.key)}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {section === "overdue"
                          ? <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                          : section === "today"
                          ? <Clock className="h-3 w-3 text-amber-600 shrink-0" />
                          : <CalendarClock className="h-3 w-3 text-blue-500 shrink-0" />}
                        <p className="text-xs font-semibold truncate">{item.name}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 pl-4">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${FREQ_COLORS[item.frequency]}`}>
                          {FREQ_LABELS[item.frequency]}
                        </span>
                        {section === "overdue" && (item.loan.lateDays ?? 0) > 0 && (
                          <span className="text-[10px] text-destructive font-medium">{item.loan.lateDays}d late</span>
                        )}
                        {section === "upcoming" && item.dueDate && (
                          <span className="text-[10px] text-blue-600">
                            due {item.dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`font-bold text-sm font-numeric ${
                        section === "overdue" ? "text-destructive" : section === "today" ? "text-amber-700" : "text-blue-700"
                      }`}>
                        {formatCurrency(item.amountDue)}
                      </span>
                      <Button
                        size="sm"
                        className="h-6 text-[11px] px-2 bg-emerald-700 hover:bg-emerald-800 text-white"
                        onClick={() => setPayItem(item)}
                      >
                        <Banknote className="h-3 w-3 mr-1" />
                        Collect
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t bg-muted/10 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 px-2"
            onClick={() => setSelected(allSelected ? new Set() : new Set(items.map(i => i.key)))}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          <div className="flex-1" />
          {selectedItems.length > 0 && (
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => setBulkOpen(true)}
            >
              <Banknote className="h-3 w-3 mr-1" />
              Collect {selectedItems.length}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </div>

      {payItem && (
        <AdminPayDialog
          item={payItem}
          open={!!payItem}
          onOpenChange={open => { if (!open) setPayItem(null); }}
          onDone={() => {
            setSelected(prev => { const s = new Set(prev); s.delete(payItem.key); return s; });
            setPayItem(null);
          }}
        />
      )}
      <AdminBulkPayDialog
        items={selectedItems}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onDone={() => setSelected(new Set())}
      />
    </>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

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

  // ── Admin collection popup items ──────────────────────────────────────────
  const adminItems = useMemo(
    () => (emiLoans ? buildAdminCollectionItems(emiLoans) : []),
    [emiLoans],
  );

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
      {/* Collection popup — shown once per page load when there are EMI payments due */}
      {!isLoadingEmi && <AdminCollectionPopup items={adminItems} />}

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
