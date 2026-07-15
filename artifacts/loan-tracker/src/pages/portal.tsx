import { useState, useMemo } from "react";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppAuth } from "@/hooks/use-app-auth";
import { useQuery } from "@tanstack/react-query";
import { EmiLoan, EMI_LOANS_QUERY_KEY, fetchEmiLoans } from "@/pages/emi-loans/components/emi-loan-form-dialog";
import {
  useListLoans,
  useCreateLoanRequest,
  getListLoansQueryKey,
  getListLoanRequestsQueryKey,
  Loan,
} from "@workspace/api-client-react";
import { useListLoanRequests } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { LoanStatusBadge } from "@/components/status-badges";
import { EmptyState } from "@/components/empty-state";
import {
  CreditCard,
  ChevronRight,
  Plus,
  Banknote,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarClock,
  AlertTriangle,
  Wallet,
  ListChecks,
  CheckSquare,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// ─── UPI VPA ──────────────────────────────────────────────────────────────────

const UPI_VPA = "9438556400@slc";

function openUpi(amount: number, note = "Loan Repayment") {
  const link = `upi://pay?pa=${UPI_VPA}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
  window.location.href = link;
}

// ─── Loan Request Dialog ──────────────────────────────────────────────────────

const loanRequestSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Enter a valid amount" })
    .positive("Amount must be greater than 0"),
  tenureDays: z.coerce
    .number({ invalid_type_error: "Enter a valid tenure" })
    .int()
    .positive("Tenure must be at least 1 day"),
  purpose: z.string().optional(),
});

type LoanRequestValues = z.infer<typeof loanRequestSchema>;

function LoanRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createLoanRequest = useCreateLoanRequest();

  const form = useForm<LoanRequestValues>({
    resolver: zodResolver(loanRequestSchema),
    defaultValues: { amount: undefined, tenureDays: undefined, purpose: "" },
  });

  function onSubmit(data: LoanRequestValues) {
    createLoanRequest.mutate(
      { data: { amount: data.amount, tenureDays: data.tenureDays, purpose: data.purpose || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLoanRequestsQueryKey() });
          toast({ title: "Request submitted", description: "Your loan request has been sent to the admin." });
          form.reset();
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Could not submit request.";
          toast({ variant: "destructive", title: "Error", description: msg });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Request a New Loan</DialogTitle>
          <DialogDescription>Fill in the details and the admin will review your request.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Loan Amount (₹)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g. 50000" min="1" step="1" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="tenureDays" render={({ field }) => (
              <FormItem>
                <FormLabel>Tenure (days)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g. 30" min="1" step="1" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="purpose" render={({ field }) => (
              <FormItem>
                <FormLabel>Purpose (optional)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Brief reason for the loan…" rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createLoanRequest.isPending}>
                {createLoanRequest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── EMI Request Dialog ───────────────────────────────────────────────────────

const emiRequestSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Enter a valid amount" })
    .positive("Amount must be greater than 0"),
  tenureMonths: z.coerce
    .number({ invalid_type_error: "Enter a valid tenure" })
    .int()
    .positive("Tenure must be at least 1 month"),
  purpose: z.string().optional(),
});

type EmiRequestValues = z.infer<typeof emiRequestSchema>;

function EmiRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const form = useForm<EmiRequestValues>({
    resolver: zodResolver(emiRequestSchema),
    defaultValues: { amount: undefined, tenureMonths: undefined, purpose: "" },
  });

  async function onSubmit(data: EmiRequestValues) {
    setIsPending(true);
    try {
      const res = await fetch("/api/loan-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: data.amount,
          tenureDays: 0,
          tenureMonths: data.tenureMonths,
          type: "EMI",
          purpose: data.purpose || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Could not submit request." }));
        throw new Error(err.error || "Could not submit request.");
      }
      queryClient.invalidateQueries({ queryKey: getListLoanRequestsQueryKey() });
      toast({ title: "EMI request submitted", description: "Your EMI loan request has been sent to the admin." });
      form.reset();
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Could not submit request." });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Request an EMI Loan</DialogTitle>
          <DialogDescription>Request a loan with monthly EMI payments. Admin will review and set up the terms.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField control={form.control} name="amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Loan Amount (₹)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g. 100000" min="1" step="1" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="tenureMonths" render={({ field }) => (
              <FormItem>
                <FormLabel>Tenure (months)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g. 12" min="1" step="1" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="purpose" render={({ field }) => (
              <FormItem>
                <FormLabel>Purpose (optional)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Brief reason for the loan…" rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Single Repay Dialog ──────────────────────────────────────────────────────

function RepayDialog({
  open,
  onOpenChange,
  label,
  outstanding,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  label: string;
  outstanding: number;
}) {
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [custom, setCustom] = useState("");

  const amount = mode === "full" ? Math.max(outstanding, 0) : Number(custom);
  const isValid = amount > 0 && Number.isFinite(amount);

  const handlePay = () => {
    openUpi(amount);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Repay — {label}</DialogTitle>
          <DialogDescription>
            This will open your UPI app to pay <strong>{UPI_VPA}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/50 p-4 space-y-1 text-sm">
            <div className="flex justify-between border-t pt-2 mt-1">
              <span className="text-muted-foreground font-medium">Outstanding</span>
              <span className="font-bold font-numeric text-destructive">{formatCurrency(Math.max(outstanding, 0))}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("full")}
              className={`rounded-lg border p-3 text-sm font-medium transition-colors text-left ${
                mode === "full" ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-semibold">Full amount</div>
              <div className="text-muted-foreground font-numeric text-xs mt-0.5">{formatCurrency(Math.max(outstanding, 0))}</div>
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`rounded-lg border p-3 text-sm font-medium transition-colors text-left ${
                mode === "custom" ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-semibold">Custom amount</div>
              <div className="text-muted-foreground text-xs mt-0.5">Enter any amount</div>
            </button>
          </div>

          {mode === "custom" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount (₹)</label>
              <Input type="number" placeholder="Enter amount" min="1" step="1" value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus />
            </div>
          )}

          {isValid && (
            <p className="text-sm text-center text-muted-foreground">
              You will pay <span className="font-semibold text-foreground">{formatCurrency(amount)}</span> to {UPI_VPA}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePay} disabled={!isValid} className="bg-emerald-700 hover:bg-emerald-800 text-white">
            <Banknote className="mr-2 h-4 w-4" />
            Pay via UPI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Repay Dialog ────────────────────────────────────────────────────────

function BulkRepayDialog({
  open,
  onOpenChange,
  total,
  count,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  total: number;
  count: number;
}) {
  const handlePay = () => {
    openUpi(total, `Loan Repayment (${count} items)`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Pay {count} item{count !== 1 ? "s" : ""}</DialogTitle>
          <DialogDescription>
            Opens your UPI app to pay <strong>{UPI_VPA}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm my-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Items selected</span>
            <span className="font-semibold">{count}</span>
          </div>
          <div className="flex justify-between border-t pt-2 mt-1">
            <span className="text-muted-foreground font-medium">Total amount</span>
            <span className="font-bold font-numeric text-lg text-foreground">{formatCurrency(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePay} className="bg-emerald-700 hover:bg-emerald-800 text-white">
            <Banknote className="mr-2 h-4 w-4" />
            Pay {formatCurrency(total)} via UPI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Unified Repayment List ───────────────────────────────────────────────────

type RepayItem = {
  key: string;
  type: "loan" | "emi";
  label: string;
  subLabel: string;
  outstanding: number;
  dueDate: Date | null;
  isOverdue: boolean;
};

function buildRepaymentItems(loans: Loan[] | undefined, emiLoans: EmiLoan[] | undefined): RepayItem[] {
  const now = new Date();
  const items: RepayItem[] = [];

  for (const l of loans ?? []) {
    if (l.status === "Clear") continue;
    const outstanding = Math.max((l.finalAmount ?? 0) - (l.paid ?? 0), 0);
    if (outstanding <= 0) continue;
    let dueDate: Date | null = null;
    if (l.returnDate) {
      dueDate = new Date(l.returnDate);
    } else if (l.transactionDate && l.tenureDays) {
      const d = new Date(l.transactionDate);
      d.setDate(d.getDate() + l.tenureDays);
      dueDate = d;
    }
    const isOverdue = !!(dueDate && dueDate < now);
    items.push({
      key: `loan-${l.id}`,
      type: "loan",
      label: `${formatCurrency(l.principal)} Loan`,
      subLabel: dueDate ? (isOverdue ? `Overdue since ${formatDate(dueDate.toISOString())}` : `Due ${formatDate(dueDate.toISOString())}`) : "No due date",
      outstanding,
      dueDate,
      isOverdue,
    });
  }

  for (const e of emiLoans ?? []) {
    if (e.status === "Clear") continue;
    const monthly = e.monthlyPayment ?? 0;
    if (monthly <= 0) continue;
    const dueDate = e.nextPaymentDate ? new Date(e.nextPaymentDate) : null;
    const isOverdue = !!(dueDate && dueDate < now);
    items.push({
      key: `emi-${e.id}`,
      type: "emi",
      label: `${formatCurrency(e.principal)} EMI Loan`,
      subLabel: dueDate ? (isOverdue ? `Overdue since ${formatDate(e.nextPaymentDate!)}` : `Next payment ${formatDate(e.nextPaymentDate!)}`) : "No due date",
      outstanding: monthly,
      dueDate,
      isOverdue,
    });
  }

  // Sort: overdue first, then by date ascending, then null dates last
  items.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  return items;
}

function RepaymentList({ loans, emiLoans }: { loans: Loan[] | undefined; emiLoans: EmiLoan[] | undefined }) {
  const items = useMemo(() => buildRepaymentItems(loans, emiLoans), [loans, emiLoans]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [singleRepay, setSingleRepay] = useState<RepayItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const toggleItem = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedItems = items.filter((i) => selected.has(i.key));
  const bulkTotal = selectedItems.reduce((sum, i) => sum + i.outstanding, 0);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-emerald-50/60 border-emerald-200 p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
        <p className="text-sm font-medium text-emerald-800">All clear!</p>
        <p className="text-xs text-emerald-600 mt-0.5">You have no outstanding repayments.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="font-medium">{selected.size} selected</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-bold font-numeric text-foreground">{formatCurrency(bulkTotal)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={() => setBulkOpen(true)}>
              <Banknote className="mr-1.5 h-3.5 w-3.5" />
              Pay {formatCurrency(bulkTotal)}
            </Button>
          </div>
        </div>
      )}

      {/* Repayment items */}
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.key}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
              item.isOverdue ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
            } ${selected.has(item.key) ? "ring-2 ring-primary/30" : ""}`}
          >
            <Checkbox
              checked={selected.has(item.key)}
              onCheckedChange={() => toggleItem(item.key)}
              aria-label={`Select ${item.label}`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{item.label}</span>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    item.type === "emi"
                      ? "border-blue-200 text-blue-700"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  {item.type === "emi" ? "EMI" : "Loan"}
                </Badge>
                {item.isOverdue && (
                  <Badge variant="destructive" className="text-xs gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Overdue
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{item.subLabel}</p>
            </div>
            <div className="text-right shrink-0">
              <div className={`font-bold font-numeric text-sm ${item.isOverdue ? "text-destructive" : "text-foreground"}`}>
                {formatCurrency(item.outstanding)}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs mt-1 px-2"
                onClick={() => setSingleRepay(item)}
              >
                Pay
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Single repay dialog */}
      {singleRepay && (
        <RepayDialog
          open={!!singleRepay}
          onOpenChange={(o) => { if (!o) setSingleRepay(null); }}
          label={singleRepay.label}
          outstanding={singleRepay.outstanding}
        />
      )}

      {/* Bulk repay dialog */}
      <BulkRepayDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        total={bulkTotal}
        count={selected.size}
      />
    </div>
  );
}

// ─── Loan Card (detail view) ──────────────────────────────────────────────────

function LoanCard({ loan }: { loan: Loan }) {
  const [repayOpen, setRepayOpen] = useState(false);
  const outstanding = (loan.finalAmount ?? 0) - (loan.paid ?? 0);

  return (
    <>
      <Card className="overflow-hidden shadow-sm border-border/60">
        <div className="bg-primary/5 px-6 py-4 border-b flex justify-between items-center gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-medium font-serif flex items-center gap-3">
              {formatCurrency(loan.principal)} Loan
              <LoanStatusBadge status={loan.status} />
            </h2>
            <p className="text-sm text-muted-foreground">
              Taken {formatDate(loan.transactionDate)} · {loan.tenureDays} days
            </p>
          </div>
          <div className="flex gap-2">
            {loan.status !== "Clear" && (
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={() => setRepayOpen(true)}>
                <Banknote className="mr-1.5 h-3.5 w-3.5" />
                Repay
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/loans/${loan.id}`}>
                Details <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
            <div className="p-5 space-y-1">
              <div className="text-xs text-muted-foreground">Total Due</div>
              <div className="text-2xl font-bold font-numeric text-foreground">
                {loan.finalAmount != null ? formatCurrency(loan.finalAmount) : "—"}
              </div>
            </div>
            <div className="p-5 bg-muted/10 space-y-1">
              <div className="text-xs text-muted-foreground">Paid So Far</div>
              <div className="text-xl font-semibold font-numeric text-emerald-700">{formatCurrency(loan.paid ?? 0)}</div>
            </div>
            <div className="p-5 space-y-1">
              <div className="text-xs text-muted-foreground">
                {loan.status === "Clear" ? "Return Date" : "Outstanding"}
              </div>
              {loan.status === "Clear" ? (
                <div className="text-xl font-semibold font-numeric">
                  {loan.returnDate ? formatDate(loan.returnDate) : "—"}
                </div>
              ) : (
                <div className={`text-xl font-semibold font-numeric ${outstanding > 0 ? "text-destructive" : "text-emerald-700"}`}>
                  {formatCurrency(Math.max(outstanding, 0))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <RepayDialog
        open={repayOpen}
        onOpenChange={setRepayOpen}
        label={`${formatCurrency(loan.principal)} Loan`}
        outstanding={Math.max(outstanding, 0)}
      />
    </>
  );
}

// ─── Loan Requests Section ────────────────────────────────────────────────────

const requestStatusIcon = {
  Pending: <Clock className="h-4 w-4 text-amber-500" />,
  Approved: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  Rejected: <XCircle className="h-4 w-4 text-destructive" />,
};

function MyLoanRequests() {
  const { data: requests, isLoading } = useListLoanRequests({
    query: { queryKey: getListLoanRequestsQueryKey() },
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!requests || requests.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold font-serif">My Requests</h2>
      <div className="space-y-2">
        {requests.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm"
          >
            <div className="flex items-center gap-3">
              {requestStatusIcon[r.status]}
              <div>
                <span className="font-semibold font-numeric">{formatCurrency(r.amount)}</span>
                <span className="text-muted-foreground ml-2">· {r.tenureDays > 0 ? `${r.tenureDays} days` : "EMI"}</span>
                {r.purpose && <p className="text-xs text-muted-foreground mt-0.5">{r.purpose}</p>}
              </div>
            </div>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                r.status === "Pending"
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : r.status === "Approved"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EMI Loans Detail Section ─────────────────────────────────────────────────

function MyEmiLoans({ enabled }: { enabled: boolean }) {
  const { data: emiLoans, isLoading } = useQuery<EmiLoan[]>({
    queryKey: EMI_LOANS_QUERY_KEY,
    queryFn: fetchEmiLoans,
    enabled,
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!emiLoans || emiLoans.length === 0) return null;

  const now = new Date();

  return (
    <div className="grid gap-4">
      {emiLoans.map((loan) => {
        const isOverdue = loan.nextPaymentDate && new Date(loan.nextPaymentDate) < now && loan.status !== "Clear";
        return (
          <Card key={loan.id} className="overflow-hidden shadow-sm border-border/60">
            <div className="bg-primary/5 px-6 py-4 border-b flex justify-between items-center gap-2 flex-wrap">
              <div>
                <h3 className="text-lg font-medium font-serif">{formatCurrency(loan.principal)} EMI Loan</h3>
                <p className="text-sm text-muted-foreground">
                  Started {formatDate(loan.transactionDate)} · {loan.tenureMonths} months
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/emi-loans/${loan.id}`}>Details <ChevronRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>
            <CardContent className="p-0">
              <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
                <div className="p-5 space-y-1">
                  <div className="text-xs text-muted-foreground">Monthly Payment</div>
                  <div className="text-2xl font-bold font-numeric text-foreground">
                    {loan.monthlyPayment != null ? formatCurrency(loan.monthlyPayment) : "—"}
                  </div>
                </div>
                <div className="p-5 bg-muted/10 space-y-1">
                  <div className="text-xs text-muted-foreground">Next Payment</div>
                  <div className={`text-xl font-semibold font-numeric ${isOverdue ? "text-destructive" : ""}`}>
                    {loan.nextPaymentDate ? formatDate(loan.nextPaymentDate) : "—"}
                    {isOverdue && <span className="block text-xs font-normal">Overdue</span>}
                  </div>
                </div>
                <div className="p-5 space-y-1">
                  <div className="text-xs text-muted-foreground">Remaining Months</div>
                  <div className="text-xl font-semibold font-numeric">
                    {loan.remainingMonths != null ? loan.remainingMonths : "—"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Portal Page ──────────────────────────────────────────────────────────────

export default function Portal() {
  const { isLoaded, role, name } = useAppAuth();
  const [loanRequestOpen, setLoanRequestOpen] = useState(false);
  const [emiRequestOpen, setEmiRequestOpen] = useState(false);

  const isReady = isLoaded && role === "borrower";

  const { data: loans, isLoading: isLoadingLoans } = useListLoans(undefined, {
    query: {
      enabled: isReady,
      queryKey: getListLoansQueryKey(),
    },
  });

  const { data: emiLoans, isLoading: isLoadingEmi } = useQuery<EmiLoan[]>({
    queryKey: EMI_LOANS_QUERY_KEY,
    queryFn: fetchEmiLoans,
    enabled: isReady,
  });

  const isLoading = isLoadingLoans || isLoadingEmi;

  // Summary stats
  const activeLoans = useMemo(() => (loans ?? []).filter((l) => l.status !== "Clear"), [loans]);
  const activeEmi = useMemo(() => (emiLoans ?? []).filter((e) => e.status !== "Clear"), [emiLoans]);
  const totalOutstanding = useMemo(
    () =>
      activeLoans.reduce((sum, l) => sum + Math.max((l.finalAmount ?? 0) - (l.paid ?? 0), 0), 0) +
      activeEmi.reduce((sum, e) => sum + (e.monthlyPayment ?? 0) * Math.max(e.remainingMonths ?? 0, 0), 0),
    [activeLoans, activeEmi],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">
          {name ? `Hi, ${name}` : "My Loans"}
        </h1>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setLoanRequestOpen(true)} variant="outline" className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Request New Loan
          </Button>
          <Button onClick={() => setEmiRequestOpen(true)} className="flex-1 sm:flex-none">
            <CalendarClock className="mr-2 h-4 w-4" />
            Request New EMI
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-sm border-border/60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">Active Loans</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold font-numeric">{activeLoans.length}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-border/60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">Active EMIs</CardTitle>
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold font-numeric">{activeEmi.length}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-border/60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total Due</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold font-numeric text-destructive">{formatCurrency(totalOutstanding)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Repayments */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold font-serif flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-muted-foreground" />
          Upcoming & Overdue Repayments
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : (
          <RepaymentList loans={loans} emiLoans={emiLoans} />
        )}
      </div>

      {/* Tabs — detail view */}
      <Tabs defaultValue="loans">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="loans" className="flex-1 sm:flex-none gap-2">
            <CreditCard className="h-4 w-4" />
            My Loans
            {activeLoans.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {activeLoans.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="emi" className="flex-1 sm:flex-none gap-2">
            <CalendarClock className="h-4 w-4" />
            My EMI Loans
            {activeEmi.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {activeEmi.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Loans Tab ── */}
        <TabsContent value="loans" className="mt-6 space-y-6">
          {isLoadingLoans ? (
            <div className="space-y-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : !loans || loans.length === 0 ? (
            <div className="py-12">
              <EmptyState
                title="No loans yet"
                description="You don't have any loans on record. Request one to get started."
                icon={<CreditCard />}
                action={
                  <Button onClick={() => setLoanRequestOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Request a Loan
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid gap-4">
              {loans.map((loan) => <LoanCard key={loan.id} loan={loan} />)}
            </div>
          )}
          <MyLoanRequests />
        </TabsContent>

        {/* ── EMI Loans Tab ── */}
        <TabsContent value="emi" className="mt-6 space-y-6">
          {isLoadingEmi ? (
            <div className="space-y-4">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : !emiLoans || emiLoans.length === 0 ? (
            <div className="py-12">
              <EmptyState
                title="No EMI loans yet"
                description="You don't have any EMI loans on record."
                icon={<CalendarClock />}
                action={
                  <Button onClick={() => setEmiRequestOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Request an EMI Loan
                  </Button>
                }
              />
            </div>
          ) : (
            <MyEmiLoans enabled={isReady} />
          )}
        </TabsContent>
      </Tabs>

      <LoanRequestDialog open={loanRequestOpen} onOpenChange={setLoanRequestOpen} />
      <EmiRequestDialog open={emiRequestOpen} onOpenChange={setEmiRequestOpen} />
    </div>
  );
}
