import { useState, useMemo } from "react";
import { PieChart, Pie, Cell } from "recharts";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppAuth } from "@/hooks/use-app-auth";
import { useQuery } from "@tanstack/react-query";
import {
  EmiLoan,
  EMI_LOANS_QUERY_KEY,
  fetchEmiLoans,
} from "@/pages/emi-loans/components/emi-loan-form-dialog";
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
  MessageCircle,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
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
import { computeEarlyPaymentDiscount, estimateFinalAmount } from "@/lib/early-payment-discount";

// ─── Constants ────────────────────────────────────────────────────────────────

const UPI_VPA = "9438556400@slc";
const WA_ADMIN = "8917656405";
const SITE_NAME = "openr3.in";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true for loans that should be hidden from cards but kept in totals. */
function isPayDailyLoan(whatsapp: string | null | undefined): boolean {
  return (whatsapp ?? "").toLowerCase().includes("pay daily");
}

function openUpi(amount: number, note = "Loan Repayment") {
  const link = `upi://pay?pa=${UPI_VPA}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
  window.location.href = link;
}

function openWhatsApp(params: {
  type: "loan" | "emi";
  name: string;
  phone: string;
  amount: number;
  tenure: string;
  purpose?: string | null;
  loanId?: string;
}) {
  const lines = [
    `🏦 New ${params.type === "emi" ? "EMI " : ""}Loan Request`,
    `👤 Name: ${params.name}`,
    `📱 Phone: ${params.phone}`,
    `💰 Amount: ₹${params.amount.toLocaleString("en-IN")}`,
    `📅 Tenure: ${params.tenure}`,
  ];
  if (params.loanId) lines.push(`🔖 ID: ${params.loanId}`);
  if (params.purpose) lines.push(`📝 Purpose: ${params.purpose}`);
  lines.push(`🗓 Date: ${new Date().toLocaleDateString("en-IN")}`);
  lines.push(SITE_NAME);
  const msg = lines.join("\n");
  window.open(`https://wa.me/91${WA_ADMIN}?text=${encodeURIComponent(msg)}`, "_blank");
}

/** Opens WhatsApp to notify the admin that a payment was just made and needs verification. */
function notifyAdminPaymentMade(params: {
  name: string;
  amount: number;
  label: string;
  loanId?: string;
}) {
  const lines = [
    `💸 Payment Made`,
    `👤 ${params.name}`,
    params.loanId ? `🔖 ID: ${params.loanId}` : null,
    `📌 ${params.label}`,
    `💰 Amount: ₹${params.amount.toLocaleString("en-IN")}`,
    `Please verify and mark as paid. 🙏`,
    SITE_NAME,
  ].filter(Boolean) as string[];
  window.open(`https://wa.me/91${WA_ADMIN}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
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
  borrowerName,
  borrowerPhone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  borrowerName: string;
  borrowerPhone: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createLoanRequest = useCreateLoanRequest();

  const form = useForm<LoanRequestValues>({
    resolver: zodResolver(loanRequestSchema),
    defaultValues: { amount: undefined, tenureDays: undefined, purpose: "" },
  });

  const watchedAmount = form.watch("amount");
  const watchedTenure = form.watch("tenureDays");
  const loanPreview = useMemo(() => {
    const p = Number(watchedAmount);
    const t = Number(watchedTenure);
    if (!p || !t || p <= 0 || t <= 0) return null;
    return estimateFinalAmount({ principal: p, tenureDays: t });
  }, [watchedAmount, watchedTenure]);

  function onSubmit(data: LoanRequestValues) {
    createLoanRequest.mutate(
      {
        data: {
          amount: data.amount,
          tenureDays: data.tenureDays,
          purpose: data.purpose || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListLoanRequestsQueryKey(),
          });
          toast({
            title: "Request submitted",
            description: "Opening WhatsApp to notify admin…",
          });
          openWhatsApp({
            type: "loan",
            name: borrowerName,
            phone: borrowerPhone,
            amount: data.amount,
            tenure: `${data.tenureDays} days`,
            purpose: data.purpose,
          });
          form.reset();
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error ? err.message : "Could not submit request.";
          toast({ variant: "destructive", title: "Error", description: msg });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request a New Loan</DialogTitle>
          <DialogDescription>
            Fill in the details. Admin will be notified via WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 pt-2"
          >
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Amount (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g. 50000"
                      min="1"
                      step="1"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tenureDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tenure (days)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g. 30"
                      min="1"
                      step="1"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief reason for the loan…"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {loanPreview && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">Estimated breakdown</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-amber-700 dark:text-amber-400">Flat Fee</p>
                    <p className="font-semibold font-numeric">{formatCurrency(loanPreview.flatFee)}</p>
                  </div>
                  <div>
                    <p className="text-amber-700 dark:text-amber-400">Interest</p>
                    <p className="font-semibold font-numeric">{formatCurrency(loanPreview.interest)}</p>
                  </div>
                  <div>
                    <p className="text-amber-700 dark:text-amber-400">Total to repay</p>
                    <p className="font-bold font-numeric text-amber-900 dark:text-amber-200">{formatCurrency(loanPreview.finalAmount)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-amber-600">Estimate only — admin confirms the exact amount.</p>
              </div>
            )}
            <DialogFooter className="pt-2 flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={createLoanRequest.isPending}
              >
                {createLoanRequest.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Submit & Notify Admin
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
  borrowerName,
  borrowerPhone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  borrowerName: string;
  borrowerPhone: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const form = useForm<EmiRequestValues>({
    resolver: zodResolver(emiRequestSchema),
    defaultValues: {
      amount: undefined,
      tenureMonths: undefined,
      purpose: "",
    },
  });

  const watchedAmount = form.watch("amount");
  const watchedTenure = form.watch("tenureMonths");
  const emiPreview = useMemo(() => {
    const p = Number(watchedAmount);
    const t = Number(watchedTenure);
    if (!p || !t || p <= 0 || t <= 0) return null;
    const monthlyRate = 0.02;
    const interestPerMonth = Math.round(p * monthlyRate);
    const principalPerMonth = Math.round(p / t);
    const monthlyPayment = interestPerMonth + principalPerMonth;
    const totalAmount = p + interestPerMonth * t;
    return { interestPerMonth, principalPerMonth, monthlyPayment, totalAmount };
  }, [watchedAmount, watchedTenure]);

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
        const err = await res
          .json()
          .catch(() => ({ error: "Could not submit request." }));
        throw new Error(err.error || "Could not submit request.");
      }
      queryClient.invalidateQueries({
        queryKey: getListLoanRequestsQueryKey(),
      });
      toast({
        title: "EMI request submitted",
        description: "Opening WhatsApp to notify admin…",
      });
      openWhatsApp({
        type: "emi",
        name: borrowerName,
        phone: borrowerPhone,
        amount: data.amount,
        tenure: `${data.tenureMonths} months`,
        purpose: data.purpose,
      });
      form.reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          err instanceof Error ? err.message : "Could not submit request.",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request an EMI Loan</DialogTitle>
          <DialogDescription>
            Request a monthly instalment loan. Admin will be notified via
            WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 pt-2"
          >
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Amount (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g. 100000"
                      min="1"
                      step="1"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tenureMonths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tenure (months)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g. 12"
                      min="1"
                      step="1"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief reason for the loan…"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {emiPreview && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">Estimated monthly breakdown</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-amber-700 dark:text-amber-400">Principal/mo</p>
                    <p className="font-semibold font-numeric">{formatCurrency(emiPreview.principalPerMonth)}</p>
                  </div>
                  <div>
                    <p className="text-amber-700 dark:text-amber-400">Interest/mo</p>
                    <p className="font-semibold font-numeric">{formatCurrency(emiPreview.interestPerMonth)}</p>
                  </div>
                  <div>
                    <p className="text-amber-700 dark:text-amber-400">Monthly EMI</p>
                    <p className="font-bold font-numeric text-amber-900 dark:text-amber-200">{formatCurrency(emiPreview.monthlyPayment)}</p>
                  </div>
                  <div>
                    <p className="text-amber-700 dark:text-amber-400">Total repayable</p>
                    <p className="font-bold font-numeric text-amber-900 dark:text-amber-200">{formatCurrency(emiPreview.totalAmount)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-amber-600">Estimate only (2%/mo) — admin confirms the exact terms.</p>
              </div>
            )}
            <DialogFooter className="pt-2 flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={isPending}
              >
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Submit & Notify Admin
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Post-payment confirmation dialog ────────────────────────────────────────

function PaymentConfirmDialog({
  open,
  onOpenChange,
  amount,
  label,
  loanId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  amount: number;
  label: string;
  loanId?: string;
}) {
  const { name } = useAppAuth();

  const handleYes = () => {
    notifyAdminPaymentMade({ name: name ?? "Borrower", amount, label, loanId });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Did you make the payment?</DialogTitle>
          <DialogDescription>
            Let us know if the {formatCurrency(amount)} payment for {label}{" "}
            went through so we can notify the admin to verify it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Not yet
          </Button>
          <Button
            className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white"
            onClick={handleYes}
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Yes, notify admin
          </Button>
        </DialogFooter>
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
  earlyDiscount = 0,
  loanId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  label: string;
  outstanding: number;
  /** Estimated early-payment discount (rupees), if this loan qualifies. */
  earlyDiscount?: number;
  loanId?: string;
}) {
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [custom, setCustom] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const payableNow = Math.max(outstanding - earlyDiscount, 0);
  const amount =
    mode === "full" ? Math.max(payableNow, 0) : Number(custom);
  const isValid = amount > 0 && Number.isFinite(amount);

  const handlePay = () => {
    openUpi(amount);
    onOpenChange(false);
    setTimeout(() => setConfirmOpen(true), 800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Repay — {label}</DialogTitle>
          <DialogDescription>
            Opens your UPI app to pay{" "}
            <strong className="font-mono">{UPI_VPA}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {earlyDiscount > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2">
              <BadgeCheck className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">
                  Pay now and save {formatCurrency(earlyDiscount)}
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Early-payment discount, estimated from the standard rate
                  card. Admin will confirm the exact amount when verifying
                  your payment.
                </p>
              </div>
            </div>
          )}
          <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
            {earlyDiscount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Original outstanding</span>
                <span className="font-numeric line-through">
                  {formatCurrency(Math.max(outstanding, 0))}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 first:border-t-0 first:pt-0">
              <span className="text-muted-foreground font-medium">
                {earlyDiscount > 0 ? "Payable now" : "Outstanding"}
              </span>
              <span className="font-bold font-numeric text-destructive">
                {formatCurrency(Math.max(payableNow, 0))}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("full")}
              className={`rounded-lg border p-3 text-sm font-medium transition-colors text-left ${
                mode === "full"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-semibold">Full amount</div>
              <div className="text-muted-foreground font-numeric text-xs mt-0.5">
                {formatCurrency(Math.max(payableNow, 0))}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`rounded-lg border p-3 text-sm font-medium transition-colors text-left ${
                mode === "custom"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-semibold">Custom amount</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                Enter any amount
              </div>
            </button>
          </div>

          {mode === "custom" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount (₹)</label>
              <Input
                type="number"
                placeholder="Enter amount"
                min="1"
                step="1"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {isValid && (
            <p className="text-sm text-center text-muted-foreground">
              You will pay{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(amount)}
              </span>{" "}
              to {UPI_VPA}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePay}
            disabled={!isValid}
            className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            <Banknote className="mr-2 h-4 w-4" />
            Pay via UPI
          </Button>
        </DialogFooter>
      </DialogContent>
      <PaymentConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        amount={amount}
        label={label}
        loanId={loanId}
      />
    </Dialog>
  );
}

// ─── Bulk Repay Dialog ────────────────────────────────────────────────────────

function BulkRepayDialog({
  open,
  onOpenChange,
  total,
  count,
  discountTotal = 0,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  total: number;
  count: number;
  /** Combined estimated early-payment discount across selected items. */
  discountTotal?: number;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const payableNow = Math.max(total - discountTotal, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>
            Pay {count} item{count !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Opens your UPI app to pay <strong>{UPI_VPA}</strong>.
          </DialogDescription>
        </DialogHeader>
        {discountTotal > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2 my-2">
            <BadgeCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="font-semibold">
              Pay now and save {formatCurrency(discountTotal)} in early-payment
              discounts
            </p>
          </div>
        )}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm my-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Items selected</span>
            <span className="font-semibold">{count}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Original total</span>
              <span className="font-numeric line-through">
                {formatCurrency(total)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 mt-1">
            <span className="text-muted-foreground font-medium">
              {discountTotal > 0 ? "Payable now" : "Total amount"}
            </span>
            <span className="font-bold font-numeric text-lg">
              {formatCurrency(payableNow)}
            </span>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              openUpi(payableNow, `Loan Repayment (${count} items)`);
              onOpenChange(false);
              setTimeout(() => setConfirmOpen(true), 800);
            }}
            className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            <Banknote className="mr-2 h-4 w-4" />
            Pay {formatCurrency(payableNow)} via UPI
          </Button>
        </DialogFooter>
      </DialogContent>
      <PaymentConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        amount={payableNow}
        label={`${count} item${count !== 1 ? "s" : ""}`}
      />
    </Dialog>
  );
}

// ─── Repayment item type ──────────────────────────────────────────────────────

type RepayItem = {
  key: string;
  id: string;
  /** Human-readable loan/EMI ID (e.g. L042, E003) */
  loanId?: string;
  type: "loan" | "emi";
  label: string;
  subLabel: string;
  outstanding: number;
  dueDate: Date | null;
  isOverdue: boolean;
  /** Estimated early-payment discount (rupees), 0 if not eligible. */
  earlyDiscount: number;
};

/** Days between now and a due date isn't within this window → eligible for the early-payment discount. */
const EARLY_PAYMENT_WINDOW_DAYS = 5;

function buildRepaymentItems(
  loans: Loan[] | undefined,
  emiLoans: EmiLoan[] | undefined,
): RepayItem[] {
  const now = new Date();
  const items: RepayItem[] = [];

  for (const l of loans ?? []) {
    if (l.status === "Clear") continue;
    if (isPayDailyLoan(l.whatsapp)) continue; // hidden from cards, kept in totals
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
    const daysUntilDue = dueDate
      ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000)
      : null;
    let earlyDiscount = 0;
    if (
      !isOverdue &&
      daysUntilDue !== null &&
      daysUntilDue > EARLY_PAYMENT_WINDOW_DAYS
    ) {
      earlyDiscount = computeEarlyPaymentDiscount({
        principal: l.principal,
        tenureDays: l.tenureDays,
        transactionDate: l.transactionDate,
        partPayment: l.partPayment,
        flatFee: l.flatFee,
        interest: l.interest,
        paymentDate: now,
      }).discount;
      earlyDiscount = Math.min(earlyDiscount, outstanding);
    }
    items.push({
      key: `loan-${l.id}`,
      id: l.id,
      loanId: l.loanId,
      type: "loan",
      label: `${formatCurrency(l.principal)} Loan`,
      subLabel: dueDate
        ? isOverdue
          ? `Overdue since ${formatDate(dueDate.toISOString())}`
          : `Due ${formatDate(dueDate.toISOString())}`
        : "No due date set",
      outstanding,
      dueDate,
      isOverdue,
      earlyDiscount,
    });
  }

  for (const e of emiLoans ?? []) {
    if (e.status === "Clear") continue;
    if (isPayDailyLoan((e as any).whatsapp)) continue; // hidden from cards, kept in totals
    const monthly = e.monthlyPayment ?? 0;
    if (monthly <= 0) continue;
    const dueDate = e.nextPaymentDate ? new Date(e.nextPaymentDate) : null;
    const isOverdue = !!(dueDate && dueDate < now);
    items.push({
      key: `emi-${e.id}`,
      id: e.id,
      loanId: (e as any).emiId,
      type: "emi",
      label: `${formatCurrency(e.principal)} EMI`,
      subLabel: dueDate
        ? isOverdue
          ? `Overdue since ${formatDate(e.nextPaymentDate!)}`
          : `Next payment ${formatDate(e.nextPaymentDate!)}`
        : "No due date",
      outstanding: monthly,
      dueDate,
      isOverdue,
      earlyDiscount: 0,
    });
  }

  return items;
}

// ─── RepayItem Card ───────────────────────────────────────────────────────────

function RepayItemCard({
  item,
  selected,
  onToggle,
  showCheckbox,
}: {
  item: RepayItem;
  selected: boolean;
  onToggle: () => void;
  showCheckbox: boolean;
}) {
  const [repayOpen, setRepayOpen] = useState(false);
  const detailHref =
    item.type === "loan" ? `/loans/${item.id}` : `/emi-loans/${item.id}`;

  return (
    <>
      <div
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
          item.isOverdue
            ? "border-destructive/40 bg-destructive/5"
            : "border-border bg-card"
        } ${selected ? "ring-2 ring-primary/30" : ""}`}
      >
        {showCheckbox && (
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={`Select ${item.label}`}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{item.label}</span>
            {item.isOverdue && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-2.5 w-2.5" />
                Overdue
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{item.subLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {item.earlyDiscount > 0 ? (
            <div className="text-right">
              <div className="text-xs text-muted-foreground line-through font-numeric">
                {formatCurrency(item.outstanding)}
              </div>
              <div className="font-bold font-numeric text-sm text-emerald-700">
                {formatCurrency(item.outstanding - item.earlyDiscount)}
              </div>
              <div className="text-[10px] font-medium text-emerald-600">
                Save {formatCurrency(item.earlyDiscount)}
              </div>
            </div>
          ) : (
            <div
              className={`font-bold font-numeric text-sm ${
                item.isOverdue ? "text-destructive" : "text-foreground"
              }`}
            >
              {formatCurrency(item.outstanding)}
            </div>
          )}
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              asChild
            >
              <Link href={detailHref}>
                Details <ChevronRight className="ml-0.5 h-3 w-3" />
              </Link>
            </Button>
            <Button
              size="sm"
              className="h-6 text-xs px-2 bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => setRepayOpen(true)}
            >
              <Banknote className="mr-1 h-3 w-3" />
              Pay
            </Button>
          </div>
        </div>
      </div>
      <RepayDialog
        open={repayOpen}
        onOpenChange={setRepayOpen}
        label={item.label}
        outstanding={item.outstanding}
        earlyDiscount={item.earlyDiscount}
        loanId={item.loanId}
      />
    </>
  );
}

// ─── Overdue Tab ──────────────────────────────────────────────────────────────

function OverdueTab({
  items,
}: {
  items: RepayItem[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const selectedItems = items.filter((i) => selected.has(i.key));
  const bulkTotal = selectedItems.reduce((s, i) => s + i.outstanding, 0);
  const bulkDiscountTotal = selectedItems.reduce(
    (s, i) => s + i.earlyDiscount,
    0,
  );

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
        <p className="text-sm font-medium text-emerald-800">No overdue loans!</p>
        <p className="text-xs text-emerald-600 mt-0.5">
          Great — you are all caught up.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="font-medium">{selected.size} selected</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => setBulkOpen(true)}
            >
              <Banknote className="mr-1.5 h-3.5 w-3.5" />
              Pay {formatCurrency(Math.max(bulkTotal - bulkDiscountTotal, 0))}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <RepayItemCard
            key={item.key}
            item={item}
            selected={selected.has(item.key)}
            onToggle={() => toggle(item.key)}
            showCheckbox
          />
        ))}
      </div>

      <BulkRepayDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        total={bulkTotal}
        count={selected.size}
        discountTotal={bulkDiscountTotal}
      />
    </div>
  );
}

// ─── Coming Up Tab ────────────────────────────────────────────────────────────

function ComingUpTab({ items }: { items: RepayItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const selectedItems = items.filter((i) => selected.has(i.key));
  const bulkTotal = selectedItems.reduce((s, i) => s + i.outstanding, 0);
  const bulkDiscountTotal = selectedItems.reduce(
    (s, i) => s + i.earlyDiscount,
    0,
  );

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/30 p-8 text-center">
        <ListChecks className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium text-muted-foreground">
          Nothing due in 5 days
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          No repayments due in the next 5 days.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="font-medium">{selected.size} selected</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => setBulkOpen(true)}
            >
              <Banknote className="mr-1.5 h-3.5 w-3.5" />
              Pay {formatCurrency(Math.max(bulkTotal - bulkDiscountTotal, 0))}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <RepayItemCard
            key={item.key}
            item={item}
            selected={selected.has(item.key)}
            onToggle={() => toggle(item.key)}
            showCheckbox
          />
        ))}
      </div>

      <BulkRepayDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        total={bulkTotal}
        discountTotal={bulkDiscountTotal}
        count={selected.size}
      />
    </div>
  );
}

// ─── Loan Card (for My Loans tab) ─────────────────────────────────────────────

function LoanCard({ loan }: { loan: Loan }) {
  const [repayOpen, setRepayOpen] = useState(false);
  const outstanding = (loan.finalAmount ?? 0) - (loan.paid ?? 0);

  const dueDate = loan.returnDate
    ? new Date(loan.returnDate)
    : loan.transactionDate && loan.tenureDays
      ? (() => {
          const d = new Date(loan.transactionDate);
          d.setDate(d.getDate() + loan.tenureDays);
          return d;
        })()
      : null;
  const now = new Date();
  const isOverdue = !!(dueDate && dueDate < now);
  const daysUntilDue = dueDate
    ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000)
    : null;
  const earlyDiscount =
    loan.status !== "Clear" &&
    !isOverdue &&
    daysUntilDue !== null &&
    daysUntilDue > EARLY_PAYMENT_WINDOW_DAYS
      ? Math.min(
          computeEarlyPaymentDiscount({
            principal: loan.principal,
            tenureDays: loan.tenureDays,
            transactionDate: loan.transactionDate,
            partPayment: loan.partPayment,
            flatFee: loan.flatFee,
            interest: loan.interest,
            paymentDate: now,
          }).discount,
          Math.max(outstanding, 0),
        )
      : 0;

  return (
    <>
      <Card className="overflow-hidden shadow-sm border-border/60">
        <div className="bg-primary/5 px-4 py-3 border-b flex justify-between items-center gap-2 flex-wrap">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2 flex-wrap">
              {formatCurrency(loan.principal)} Loan
              <LoanStatusBadge status={loan.status} />
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono mr-2">{loan.loanId}</span>
              {formatDate(loan.transactionDate)} · {loan.tenureDays}d
              {dueDate && (
                <span className={`ml-2 ${isOverdue ? "text-destructive" : ""}`}>
                  · {isOverdue ? "Overdue" : "Due"} {formatDate(dueDate.toISOString())}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {loan.status !== "Clear" && (
              <Button
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={() => setRepayOpen(true)}
              >
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
          <div className="grid grid-cols-3 divide-x text-center">
            <div className="p-4 space-y-0.5">
              <div className="text-xs text-muted-foreground">Total Due</div>
              <div className="text-lg font-bold font-numeric">
                {loan.finalAmount != null
                  ? formatCurrency(loan.finalAmount)
                  : "—"}
              </div>
            </div>
            <div className="p-4 bg-muted/10 space-y-0.5">
              <div className="text-xs text-muted-foreground">Paid</div>
              <div className="text-base font-semibold font-numeric text-emerald-700">
                {formatCurrency(loan.paid ?? 0)}
              </div>
            </div>
            <div className="p-4 space-y-0.5">
              <div className="text-xs text-muted-foreground">
                {loan.status === "Clear" ? "Return Date" : "Outstanding"}
              </div>
              {loan.status === "Clear" ? (
                <div className="text-base font-semibold font-numeric">
                  {loan.returnDate ? formatDate(loan.returnDate) : "—"}
                </div>
              ) : (
                <div
                  className={`text-base font-semibold font-numeric ${outstanding > 0 ? "text-destructive" : "text-emerald-700"}`}
                >
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
        earlyDiscount={earlyDiscount}
        loanId={loan.loanId}
      />
    </>
  );
}

// ─── Loan Requests section ────────────────────────────────────────────────────

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
    <div className="space-y-3 pt-2">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        My Requests
      </h2>
      <div className="space-y-2">
        {requests.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm"
          >
            <div className="flex items-center gap-3">
              {requestStatusIcon[r.status]}
              <div>
                <span className="font-semibold font-numeric">
                  {formatCurrency(r.amount)}
                </span>
                <span className="text-muted-foreground ml-2">
                  ·{" "}
                  {(r as any).type === "EMI"
                    ? `${(r as any).tenureMonths ?? "?"} months EMI`
                    : r.tenureDays > 0
                      ? `${r.tenureDays} days`
                      : "EMI"}
                </span>
                {r.purpose && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.purpose}
                  </p>
                )}
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

// ─── EMI Loans detail section ─────────────────────────────────────────────────

function MyEmiLoans({ emiLoans }: { emiLoans: EmiLoan[] }) {
  const now = new Date();
  const active = emiLoans.filter((e) => e.status !== "Clear");

  if (active.length === 0) {
    return (
      <div className="py-10 text-center">
        <EmptyState
          title="No active EMI loans"
          description="You have no active EMI loans on record."
          icon={<CalendarClock />}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {active.map((loan) => {
        const isOverdue =
          loan.nextPaymentDate &&
          new Date(loan.nextPaymentDate) < now &&
          loan.status !== "Clear";
        return (
          <Card
            key={loan.id}
            className="overflow-hidden shadow-sm border-border/60"
          >
            <div className="bg-primary/5 px-4 py-3 border-b flex justify-between items-center gap-2 flex-wrap">
              <div>
                <h3 className="text-base font-semibold">
                  {formatCurrency(loan.principal)} EMI Loan
                </h3>
                <p className="text-xs text-muted-foreground">
                  {formatDate(loan.transactionDate)} · {loan.tenureMonths} months
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/emi-loans/${loan.id}`}>
                  Details <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <CardContent className="p-0">
              <div className="grid grid-cols-3 divide-x text-center">
                <div className="p-4 space-y-0.5">
                  <div className="text-xs text-muted-foreground">Monthly</div>
                  <div className="text-lg font-bold font-numeric">
                    {loan.monthlyPayment != null
                      ? formatCurrency(loan.monthlyPayment)
                      : "—"}
                  </div>
                </div>
                <div
                  className={`p-4 space-y-0.5 ${isOverdue ? "bg-destructive/5" : "bg-muted/10"}`}
                >
                  <div className="text-xs text-muted-foreground">
                    Next Payment
                  </div>
                  <div
                    className={`text-sm font-semibold ${isOverdue ? "text-destructive" : ""}`}
                  >
                    {loan.nextPaymentDate
                      ? formatDate(loan.nextPaymentDate)
                      : "—"}
                    {isOverdue && (
                      <span className="block text-xs font-normal">Overdue</span>
                    )}
                  </div>
                </div>
                <div className="p-4 space-y-0.5">
                  <div className="text-xs text-muted-foreground">Remaining</div>
                  <div className="text-base font-semibold">
                    {loan.remainingMonths != null
                      ? `${loan.remainingMonths} mo`
                      : "—"}
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

// ─── Already Paid Section ─────────────────────────────────────────────────────

function AlreadyPaidSection({
  loans,
  emiLoans,
}: {
  loans: Loan[];
  emiLoans: EmiLoan[];
}) {
  const [open, setOpen] = useState(false);

  const paidLoans = loans.filter((l) => l.status === "Clear");
  const paidEmi = emiLoans.filter((e) => e.status === "Clear");
  const total = paidLoans.length + paidEmi.length;

  if (total === 0) return null;

  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold text-sm">
            Already Paid ({total})
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="divide-y">
          {paidLoans.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between px-4 py-3 bg-emerald-50/30 text-sm"
            >
              <div>
                <span className="font-semibold font-numeric">
                  {formatCurrency(l.principal)} Loan
                </span>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Paid on {l.returnDate ? formatDate(l.returnDate) : "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold font-numeric text-emerald-700">
                  {l.paid != null ? formatCurrency(l.paid) : "—"}
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2 mt-0.5" asChild>
                  <Link href={`/loans/${l.id}`}>
                    Details <ChevronRight className="ml-0.5 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
          {paidEmi.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between px-4 py-3 bg-emerald-50/30 text-sm"
            >
              <div>
                <span className="font-semibold font-numeric">
                  {formatCurrency(e.principal)} EMI Loan
                </span>
                <Badge variant="outline" className="ml-2 text-xs border-blue-200 text-blue-700">
                  EMI
                </Badge>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Completed
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold font-numeric text-emerald-700">
                  {e.monthlyPayment != null
                    ? `${formatCurrency(e.monthlyPayment)}/mo`
                    : "—"}
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2 mt-0.5" asChild>
                  <Link href={`/emi-loans/${e.id}`}>
                    Details <ChevronRight className="ml-0.5 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Loans Tab (My Loans with multi-select prepayment) ───────────────────────

function LoansTab({
  loans,
  isLoading,
  onRequestLoan,
}: {
  loans: Loan[];
  isLoading: boolean;
  onRequestLoan: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const now = new Date();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Filter out pay-daily loans from display
  const displayLoans = loans.filter((l) => !isPayDailyLoan(l.whatsapp));

  const selectedItems = displayLoans.filter((l) => selected.has(l.id));
  const bulkTotal = selectedItems.reduce(
    (s, l) => s + Math.max((l.finalAmount ?? 0) - (l.paid ?? 0), 0),
    0,
  );
  const bulkDiscountTotal = selectedItems.reduce((s, l) => {
    const outstanding = Math.max((l.finalAmount ?? 0) - (l.paid ?? 0), 0);
    const dueDate = l.returnDate
      ? new Date(l.returnDate)
      : l.transactionDate && l.tenureDays
        ? (() => {
            const d = new Date(l.transactionDate);
            d.setDate(d.getDate() + l.tenureDays);
            return d;
          })()
        : null;
    const isOverdue = !!(dueDate && dueDate < now);
    const daysUntilDue = dueDate
      ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000)
      : null;
    if (
      !isOverdue &&
      daysUntilDue !== null &&
      daysUntilDue > EARLY_PAYMENT_WINDOW_DAYS
    ) {
      return (
        s +
        Math.min(
          computeEarlyPaymentDiscount({
            principal: l.principal,
            tenureDays: l.tenureDays,
            transactionDate: l.transactionDate,
            partPayment: l.partPayment,
            flatFee: l.flatFee,
            interest: l.interest,
            paymentDate: now,
          }).discount,
          outstanding,
        )
      );
    }
    return s;
  }, 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (displayLoans.length === 0) {
    return (
      <div className="py-10">
        <EmptyState
          title="No active loans"
          description="You don't have any active loans. Request one to get started."
          icon={<CreditCard />}
          action={
            <Button onClick={onRequestLoan}>
              <Plus className="mr-2 h-4 w-4" /> Request a Loan
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="font-medium">{selected.size} selected</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => setBulkOpen(true)}
            >
              <Banknote className="mr-1.5 h-3.5 w-3.5" />
              Pay {formatCurrency(Math.max(bulkTotal - bulkDiscountTotal, 0))}
            </Button>
          </div>
        </div>
      )}
      <div className="grid gap-3">
        {displayLoans.map((loan) => (
          <div key={loan.id} className="flex items-start gap-2">
            <Checkbox
              className="mt-4 shrink-0"
              checked={selected.has(loan.id)}
              onCheckedChange={() => toggle(loan.id)}
              aria-label={`Select ${formatCurrency(loan.principal)} loan`}
            />
            <div className="flex-1 min-w-0">
              <LoanCard loan={loan} />
            </div>
          </div>
        ))}
      </div>
      <BulkRepayDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        total={bulkTotal}
        count={selected.size}
        discountTotal={bulkDiscountTotal}
      />
    </div>
  );
}

// ─── Portal Page ──────────────────────────────────────────────────────────────

export default function Portal() {
  const { isLoaded, role, name, creditLimit } = useAppAuth();
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

  // Build repayment items (all active)
  const allItems = useMemo(
    () => buildRepaymentItems(loans, emiLoans),
    [loans, emiLoans],
  );

  const overdueItems = useMemo(
    () => allItems.filter((i) => i.isOverdue),
    [allItems],
  );

  const comingUpItems = useMemo(
    () => {
      const now = new Date();
      return allItems
        .filter((i) => {
          if (i.isOverdue) return false;
          if (!i.dueDate) return false;
          const daysUntil = (i.dueDate.getTime() - now.getTime()) / 86400000;
          return daysUntil >= 0 && daysUntil <= 5;
        })
        .sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.getTime() - b.dueDate.getTime();
        });
    },
    [allItems],
  );

  const hasOverdue = overdueItems.length > 0;
  const defaultTab = hasOverdue ? "overdue" : "coming-up";

  // Summary stats
  const activeLoans = useMemo(
    () => (loans ?? []).filter((l) => l.status !== "Clear"),
    [loans],
  );
  const activeEmi = useMemo(
    () => (emiLoans ?? []).filter((e) => e.status !== "Clear"),
    [emiLoans],
  );
  const totalOutstanding = useMemo(
    () =>
      activeLoans.reduce(
        (sum, l) => sum + Math.max((l.finalAmount ?? 0) - (l.paid ?? 0), 0),
        0,
      ) +
      activeEmi.reduce(
        (sum, e) =>
          sum + (e.monthlyPayment ?? 0) * Math.max(e.remainingMonths ?? 0, 0),
        0,
      ),
    [activeLoans, activeEmi],
  );

  // Credit limit utilisation
  const usedPrincipal = useMemo(
    () =>
      activeLoans.reduce((s, l) => s + (l.principal ?? 0), 0) +
      activeEmi.reduce((s, e) => s + (e.principal ?? 0), 0),
    [activeLoans, activeEmi],
  );
  const availableCredit =
    creditLimit != null ? Math.max(creditLimit - usedPrincipal, 0) : null;
  const usedPct =
    creditLimit && creditLimit > 0
      ? Math.min(Math.round((usedPrincipal / creditLimit) * 100), 100)
      : null;
  const isOverLimit = creditLimit != null && usedPrincipal > creditLimit;

  // borrower phone for WhatsApp — extract from session via me endpoint if needed
  // We pass borrowerName and phone to the dialogs
  const borrowerPhone = "";  // phone not exposed via useAppAuth; admin sees it in the request sheet

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-serif">
          {name ? `Hi, ${name.split(" ")[0]}` : "My Loans"}
        </h1>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => setLoanRequestOpen(true)}
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Request Loan
          </Button>
          <Button
            onClick={() => setEmiRequestOpen(true)}
            size="sm"
            className="flex-1 sm:flex-none"
          >
            <CalendarClock className="mr-1.5 h-4 w-4" />
            Request EMI
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Count cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="shadow-sm border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">
                  Active Loans
                </CardTitle>
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-2xl font-bold font-numeric">
                  {activeLoans.length}
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">
                  Active EMIs
                </CardTitle>
                <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-2xl font-bold font-numeric">
                  {activeEmi.length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Credit limit utilisation card */}
          <Card
            className={`shadow-sm ${isOverLimit ? "border-destructive/40 bg-destructive/5" : "border-border/60"}`}
          >
            <CardContent className="px-4 py-3">
              <div className="flex items-center gap-4">
                {/* Donut chart */}
                <div className="relative shrink-0" style={{ width: 84, height: 84 }}>
                  <PieChart width={84} height={84}>
                    <Pie
                      data={
                        creditLimit != null && creditLimit > 0
                          ? [
                              { name: "Used", value: Math.min(usedPrincipal, creditLimit) },
                              { name: "Available", value: Math.max(creditLimit - usedPrincipal, 0) },
                              ...(isOverLimit
                                ? [{ name: "Over", value: usedPrincipal - creditLimit }]
                                : []),
                            ]
                          : usedPrincipal > 0
                          ? [{ name: "Used", value: 1 }]
                          : [{ name: "Empty", value: 1 }]
                      }
                      cx={38}
                      cy={38}
                      innerRadius={26}
                      outerRadius={38}
                      strokeWidth={0}
                      startAngle={90}
                      endAngle={-270}
                      dataKey="value"
                    >
                      {creditLimit != null && creditLimit > 0 ? (
                        <>
                          <Cell fill={isOverLimit ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />
                          <Cell fill="hsl(var(--muted))" />
                          {isOverLimit && <Cell fill="hsl(var(--destructive) / 0.4)" />}
                        </>
                      ) : usedPrincipal > 0 ? (
                        <Cell fill="hsl(var(--primary))" />
                      ) : (
                        <Cell fill="hsl(var(--muted))" />
                      )}
                    </Pie>
                  </PieChart>
                  {/* Centre label */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span
                      className={`text-xs font-bold font-numeric ${isOverLimit ? "text-destructive" : "text-foreground"}`}
                    >
                      {usedPct != null ? `${usedPct}%` : "—"}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Credit Limit
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Used</p>
                      <p
                        className={`text-sm font-bold font-numeric leading-tight ${isOverLimit ? "text-destructive" : ""}`}
                      >
                        {formatCurrency(usedPrincipal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        {creditLimit != null ? "Available" : "Limit"}
                      </p>
                      <p className="text-sm font-bold font-numeric leading-tight">
                        {creditLimit != null
                          ? formatCurrency(availableCredit ?? 0)
                          : <span className="text-muted-foreground font-normal text-xs">No limit set</span>}
                      </p>
                    </div>
                  </div>
                  {creditLimit != null && (
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isOverLimit ? "bg-destructive" : "bg-primary"}`}
                        style={{ width: `${Math.min((usedPrincipal / creditLimit) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                  {creditLimit != null && (
                    <p className="text-[10px] text-muted-foreground">
                      of {formatCurrency(creditLimit)} total limit
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue={defaultTab}>
        <div className="overflow-x-auto">
          <TabsList className="w-max min-w-full flex-nowrap">
            <TabsTrigger value="overdue" className="shrink-0 gap-1.5 text-xs sm:text-sm px-3">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Overdue
              {overdueItems.length > 0 && (
                <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-xs font-bold text-destructive">
                  {overdueItems.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="coming-up" className="shrink-0 gap-1.5 text-xs sm:text-sm px-3">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              Coming Up
              {comingUpItems.length > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {comingUpItems.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="loans" className="shrink-0 gap-1.5 text-xs sm:text-sm px-3">
              <CreditCard className="h-3.5 w-3.5 shrink-0" />
              Loans
            </TabsTrigger>
            <TabsTrigger value="emi" className="shrink-0 gap-1.5 text-xs sm:text-sm px-3">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              EMI
            </TabsTrigger>
            <TabsTrigger value="requests" className="shrink-0 gap-1.5 text-xs sm:text-sm px-3">
              <ListChecks className="h-3.5 w-3.5 shrink-0" />
              Requests
            </TabsTrigger>
            <TabsTrigger value="paid" className="shrink-0 gap-1.5 text-xs sm:text-sm px-3">
              <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
              Paid
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Overdue Tab ── */}
        <TabsContent value="overdue" className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <OverdueTab items={overdueItems} />
          )}
        </TabsContent>

        {/* ── Coming Up Tab ── */}
        <TabsContent value="coming-up" className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <ComingUpTab items={comingUpItems} />
          )}
        </TabsContent>

        {/* ── My Loans Tab ── */}
        <TabsContent value="loans" className="mt-4">
          <LoansTab
            loans={activeLoans}
            isLoading={isLoadingLoans}
            onRequestLoan={() => setLoanRequestOpen(true)}
          />
        </TabsContent>

        {/* ── My EMI Tab ── */}
        <TabsContent value="emi" className="mt-4">
          {isLoadingEmi ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <MyEmiLoans emiLoans={emiLoans ?? []} />
          )}
        </TabsContent>

        {/* ── Requests Tab ── */}
        <TabsContent value="requests" className="mt-4">
          <MyLoanRequests />
        </TabsContent>

        {/* ── Paid Tab ── */}
        <TabsContent value="paid" className="mt-4">
          <PaidTab loans={loans ?? []} emiLoans={emiLoans ?? []} isLoading={isLoading || isLoadingEmi} />
        </TabsContent>
      </Tabs>

      <LoanRequestDialog
        open={loanRequestOpen}
        onOpenChange={setLoanRequestOpen}
        borrowerName={name ?? ""}
        borrowerPhone={borrowerPhone}
      />
      <EmiRequestDialog
        open={emiRequestOpen}
        onOpenChange={setEmiRequestOpen}
        borrowerName={name ?? ""}
        borrowerPhone={borrowerPhone}
      />
    </div>
  );
}
