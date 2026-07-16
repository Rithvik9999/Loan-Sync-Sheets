import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { PieChart, Pie, Cell } from "recharts";
import { addDays, differenceInCalendarDays, parseISO, format as dateFnsFormat } from "date-fns";
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
  CalendarRange,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
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

// ─── Loan Type Options with Discounts ─────────────────────────────────────────

const LOAN_TYPE_OPTIONS = [
  { value: "direct", label: "Direct Loan Request", discountPct: 0 },
  { value: "bgmi-uc", label: "BGMI UC Code Request", discountPct: 0.06 },
  { value: "google-play", label: "Google Play Redeem Code Request", discountPct: 0.04 },
  { value: "other-gift-card", label: "Other Gift Card Request", discountPct: 0.02 },
  { value: "mobile-recharge", label: "Mobile or Other Recharges", discountPct: 0.02 },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true for loans that should be hidden from individual cards but consolidated. */
function isPayDailyLoan(whatsapp: string | null | undefined, notes?: string | null): boolean {
  return (
    (whatsapp ?? "").toLowerCase().includes("pay daily") ||
    (notes ?? "").toLowerCase().includes("pay daily")
  );
}

/**
 * Parses payment frequency and per-period amount from notes/whatsapp.
 * Handles: "pay daily 600", "pay weekly 5000"
 */
function parsePaymentFrequency(
  notes: string | null | undefined,
  whatsapp: string | null | undefined,
): { type: "daily" | "weekly" | null; amount: number | null } {
  const text = `${notes ?? ""} ${whatsapp ?? ""}`.toLowerCase();
  const dailyMatch = text.match(/pay\s+daily\s+(\d+)/);
  if (dailyMatch) return { type: "daily", amount: Number(dailyMatch[1]) };
  const weeklyMatch = text.match(/pay\s+weekly\s+(\d+)/);
  if (weeklyMatch) return { type: "weekly", amount: Number(weeklyMatch[1]) };
  return { type: null, amount: null };
}

/**
 * Converts a usage percentage (0-100) to a hex color interpolated
 * green → amber → red. Avoids CSS hsl() which can fail in SVG fill attrs.
 */
function pctToHex(pct: number): string {
  const p = Math.max(0, Math.min(100, pct)) / 100;
  let r: number, g: number, b: number;
  if (p <= 0.5) {
    const t = p * 2; // 0→1 from green to amber
    r = Math.round(22 + t * (217 - 22));   // 22→217
    g = Math.round(163 + t * (119 - 163)); // 163→119
    b = Math.round(74 + t * (6 - 74));     // 74→6
  } else {
    const t = (p - 0.5) * 2; // 0→1 from amber to red
    r = Math.round(217 + t * (220 - 217)); // 217→220
    g = Math.round(119 + t * (38 - 119));  // 119→38
    b = Math.round(6 + t * (38 - 6));      // 6→38
  }
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
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
  returnDate: z.string().optional(),
  purpose: z.string().optional(),
  upiId: z.string().optional(),
});

type LoanRequestValues = z.infer<typeof loanRequestSchema>;

function LoanRequestDialog({
  open,
  onOpenChange,
  borrowerName,
  borrowerPhone,
  availableCredit,
  creditLimit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  borrowerName: string;
  borrowerPhone: string;
  availableCredit: number | null;
  creditLimit: number | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createLoanRequest = useCreateLoanRequest();
  const today = dateFnsFormat(new Date(), "yyyy-MM-dd");
  const [loanType, setLoanType] = useState<string>("direct");
  const typeDiscountPct = LOAN_TYPE_OPTIONS.find((o) => o.value === loanType)?.discountPct ?? 0;

  const form = useForm<LoanRequestValues>({
    resolver: zodResolver(loanRequestSchema),
    defaultValues: {
      amount: undefined,
      tenureDays: 30,
      returnDate: dateFnsFormat(addDays(new Date(), 30), "yyyy-MM-dd"),
      purpose: "",
    },
  });

  const watchedAmount = form.watch("amount");
  const watchedTenure = form.watch("tenureDays");

  const loanPreview = useMemo(() => {
    const p = Number(watchedAmount);
    const t = Number(watchedTenure);
    if (!p || !t || p <= 0 || t <= 0) return null;
    const base = estimateFinalAmount({ principal: p, tenureDays: t });
    const typeDiscountAmt = Math.round(base.finalAmount * typeDiscountPct);
    return { ...base, typeDiscountAmt, discountedFinalAmount: base.finalAmount - typeDiscountAmt };
  }, [watchedAmount, watchedTenure, typeDiscountPct]);

  // Credit limit validation
  const creditLimitError = useMemo(() => {
    const amt = Number(watchedAmount);
    if (!amt || availableCredit == null) return null;
    if (amt > availableCredit) {
      return `Amount exceeds your available credit of ${formatCurrency(availableCredit)}`;
    }
    return null;
  }, [watchedAmount, availableCredit]);

  const handleTenureChange = (value: string) => {
    form.setValue("tenureDays", Number(value) || 1);
    const days = Number(value);
    if (days > 0) {
      try {
        form.setValue("returnDate", dateFnsFormat(addDays(new Date(), days), "yyyy-MM-dd"), { shouldDirty: false });
      } catch {}
    }
  };

  const handleReturnDateChange = (value: string) => {
    form.setValue("returnDate", value);
    if (value) {
      try {
        const diff = differenceInCalendarDays(parseISO(value), new Date());
        if (diff > 0) form.setValue("tenureDays", diff, { shouldDirty: false });
      } catch {}
    }
  };

  function onSubmit(data: LoanRequestValues) {
    if (creditLimitError) {
      toast({ variant: "destructive", title: "Credit limit exceeded", description: creditLimitError });
      return;
    }
    createLoanRequest.mutate(
      {
        data: {
          amount: data.amount,
          tenureDays: data.tenureDays,
          purpose: data.purpose || null,
          upiId: data.upiId || null,
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
          form.reset({
            amount: undefined,
            tenureDays: 30,
            returnDate: dateFnsFormat(addDays(new Date(), 30), "yyyy-MM-dd"),
            purpose: "",
          });
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

        {/* Credit limit summary */}
        {creditLimit != null && (
          <div className={`rounded-lg px-3 py-2.5 text-sm ${availableCredit != null && availableCredit <= 0 ? "bg-destructive/10 border border-destructive/30" : "bg-muted/40 border border-border/60"}`}>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Available Credit</span>
              <span className={`font-bold font-numeric ${availableCredit != null && availableCredit <= 0 ? "text-destructive" : "text-foreground"}`}>
                {formatCurrency(availableCredit ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-muted-foreground text-xs">Total Limit</span>
              <span className="text-xs text-muted-foreground font-numeric">{formatCurrency(creditLimit)}</span>
            </div>
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 pt-2"
          >
            {/* Loan Type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Request Type</label>
              <Select value={loanType} onValueChange={setLoanType}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOAN_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                      className={creditLimitError ? "border-destructive focus-visible:ring-destructive" : ""}
                    />
                  </FormControl>
                  {creditLimitError && (
                    <p className="text-xs text-destructive font-medium mt-1">{creditLimitError}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tenure + Return Date — linked pair */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="tenureDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenure (days)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="30"
                        min="1"
                        step="1"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => handleTenureChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="returnDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Return By</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        min={today}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => handleReturnDateChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
            <FormField
              control={form.control}
              name="upiId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>UPI ID (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. name@upi"
                      {...field}
                      value={field.value ?? ""}
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
                    <p className={`font-bold font-numeric text-amber-900 dark:text-amber-200 ${loanPreview.typeDiscountAmt > 0 ? "line-through opacity-60 text-xs" : ""}`}>
                      {formatCurrency(loanPreview.finalAmount)}
                    </p>
                  </div>
                </div>
                {loanPreview.typeDiscountAmt > 0 && (
                  <div className="flex items-center justify-between rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-1.5 text-xs">
                    <span className="text-emerald-700 dark:text-emerald-400">You pay (after discount)</span>
                    <span className="font-bold font-numeric text-emerald-800 dark:text-emerald-300 text-sm">{formatCurrency(loanPreview.discountedFinalAmount)}</span>
                  </div>
                )}
                <p className="text-[10px] text-amber-600">Estimate only — admin will confirm the exact amount.</p>
                {loanType !== "direct" && (
                  <p className="text-[10px] text-muted-foreground border-t border-amber-200 pt-1.5 mt-0.5">
                    ⏱ Requests other than direct loans may take up to 60 minutes to process.
                  </p>
                )}
              </div>
            )}
            {loanType !== "direct" && !loanPreview && (
              <p className="text-[10px] text-muted-foreground bg-muted/40 border border-border/60 rounded px-2 py-1.5">
                ⏱ Requests other than direct loans may take up to 60 minutes to process.
              </p>
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
                disabled={createLoanRequest.isPending || !!creditLimitError}
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
  upiId: z.string().optional(),
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
          upiId: data.upiId || null,
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
            <FormField
              control={form.control}
              name="upiId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>UPI ID (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. name@upi"
                      {...field}
                      value={field.value ?? ""}
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

/**
 * Fixed payment-date schedule for "weekly" (4× per month) loans.
 * Only the 8th, 15th, 22nd, and 30th of each month are valid due dates.
 */
const MONTHLY_PAYMENT_DAYS = [8, 15, 22, 30] as const;

/** Count of 8/15/22/30 dates strictly after startDate and ≤ targetDate. */
function countWeeklyPaymentDates(startDate: Date, targetDate: Date): number {
  let count = 0;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  let year = start.getFullYear();
  let month = start.getMonth();
  for (let m = 0; m < 36; m++) {
    for (const day of MONTHLY_PAYMENT_DAYS) {
      const d = new Date(year, month, day);
      if (d <= start) continue;
      if (d > target) return count;
      count++;
    }
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return count;
}

/** Most recent 8/15/22/30 date strictly after startDate and ≤ targetDate (current period due). Returns null if none yet. */
function getCurrentWeeklyPaymentDate(startDate: Date, targetDate: Date): Date | null {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  let best: Date | null = null;
  let year = start.getFullYear();
  let month = start.getMonth();
  for (let m = 0; m < 36; m++) {
    for (const day of MONTHLY_PAYMENT_DAYS) {
      const d = new Date(year, month, day);
      if (d <= start) continue;
      if (d > target) return best;
      best = d;
    }
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return best;
}

/** Next 8/15/22/30 date strictly after both startDate and targetDate (upcoming payment). */
function getNextWeeklyPaymentDate(startDate: Date, targetDate: Date): Date | null {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  let year = target.getFullYear();
  let month = target.getMonth();
  for (let m = 0; m < 36; m++) {
    for (const day of MONTHLY_PAYMENT_DAYS) {
      const d = new Date(year, month, day);
      if (d <= start) continue;
      if (d > target) return d;
    }
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return null;
}

/** The N-th (1-indexed) 8/15/22/30 payment date strictly after startDate. */
function getNthWeeklyPaymentDate(startDate: Date, n: number): Date | null {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  let count = 0;
  let year = start.getFullYear();
  let month = start.getMonth();
  for (let m = 0; m < 36; m++) {
    for (const day of MONTHLY_PAYMENT_DAYS) {
      const d = new Date(year, month, day);
      if (d <= start) continue;
      count++;
      if (count === n) return d;
    }
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return null;
}

/**
 * Computes the accumulated overdue amount for periodic (daily/weekly) payments.
 * Each missed period accrues a 1%/day late fee for every day it has been overdue.
 *
 * @param firstDaysLate  Actual calendar days since the MOST RECENT overdue period's due date.
 *                       Defaults to daysPerPeriod (safe default for daily where period=1 day).
 *                       For weekly loans pass the real days-late (e.g. 1 day after payment date).
 *
 * e.g. daily ₹600, 2 days overdue, firstDaysLate=1 (most recent missed day was yesterday):
 *   day 2 (1 day late)  → 600 × (1 + 0.01×1) = 606
 *   day 1 (2 days late) → 600 × (1 + 0.01×2) = 612
 *   total = 1 218
 *
 * e.g. weekly ₹5 000, 1 payment overdue, firstDaysLate=1 (1 day past the payment date):
 *   → 5 000 × (1 + 0.01×1) = 5 050   (not 5 350 which wrongly assumes 7-day lag)
 */
function calcOverdueTotal(
  periodAmount: number,
  overdueCount: number,
  daysPerPeriod: number,
  firstDaysLate?: number,
  rate: number = 0.01,
): number {
  // Most-recent missed period = firstDaysLate days ago.
  // Each older period adds another daysPerPeriod of lateness.
  // Default: firstDaysLate = daysPerPeriod (correct for daily where 1 period = 1 day).
  const recentLate = firstDaysLate ?? daysPerPeriod;
  let total = 0;
  for (let i = 1; i <= overdueCount; i++) {
    // i=1 = oldest (most days late), i=overdueCount = most recent
    const daysLate = recentLate + (overdueCount - i) * daysPerPeriod;
    total += periodAmount * (1 + rate * daysLate);
  }
  return Math.round(total);
}

function buildRepaymentItems(
  loans: Loan[] | undefined,
  emiLoans: EmiLoan[] | undefined,
): RepayItem[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items: RepayItem[] = [];

  // ── Regular loans ──
  for (const l of loans ?? []) {
    if (l.status === "Clear") continue;
    const lnotes = (l as any).notes as string | null;
    const freq = parsePaymentFrequency(lnotes, l.whatsapp);
    const txDate = l.transactionDate ? new Date(l.transactionDate + "T00:00:00Z") : null;

    // ── Daily payment loan ──
    if (isPayDailyLoan(l.whatsapp, lnotes)) {
      const dailyAmt = freq.amount ?? 0;
      if (!txDate || dailyAmt <= 0) continue;

      const daysElapsed = Math.max(differenceInCalendarDays(today, txDate), 0);
      // periodsElapsed = all days elapsed (including yesterday). Today's payment
      // is NOT counted as overdue — it is always shown as "due today" separately.
      // A normal ₹dailyAmt payment is on-time (>= all elapsed periods paid at normal rate).
      // Only the +2% rate payment clears an overdue day.
      const periodsElapsed = daysElapsed;
      const paidNormal = Math.floor((l.paid ?? 0) / dailyAmt);
      const isOnTimeLoan = paidNormal >= periodsElapsed;
      const clearingAmtLoan = isOnTimeLoan ? dailyAmt : Math.ceil(dailyAmt * 1.02);
      const paidPeriods = Math.floor((l.paid ?? 0) / clearingAmtLoan);
      const overdueDays = Math.max(periodsElapsed - paidPeriods, 0);
      const returnDate = l.returnDate ? new Date(l.returnDate + "T00:00:00Z") : null;
      const withinTenure = !returnDate || today <= returnDate;

      if (overdueDays > 0) {
        // Each missed day piles up with 2%/day late fee
        const overdueTotal = calcOverdueTotal(dailyAmt, overdueDays, 1, undefined, 0.02);
        const firstDue = new Date(txDate.getTime() + (paidPeriods + 1) * 86400000);
        items.push({
          key: `daily-overdue-${l.id}`,
          id: l.id, loanId: l.loanId, type: "loan",
          label: `Daily Payment — ₹${dailyAmt.toLocaleString("en-IN")}/day`,
          subLabel: `${overdueDays} missed payment${overdueDays > 1 ? "s" : ""} · +2%/day late fee`,
          outstanding: overdueTotal,
          dueDate: firstDue,
          isOverdue: true,
          earlyDiscount: 0,
        });
      }
      // Always push today's daily payment into Coming Up regardless of overdue status
      items.push({
        key: `daily-today-${l.id}`,
        id: l.id, loanId: l.loanId, type: "loan",
        label: `Daily Payment — ₹${dailyAmt.toLocaleString("en-IN")}/day`,
        subLabel: overdueDays > 0 ? `Today's payment (${overdueDays} missed)` : "Due today",
        outstanding: dailyAmt,
        dueDate: today,
        isOverdue: false,
        earlyDiscount: 0,
      });
      continue;
    }

    // ── Weekly payment loan (8th / 15th / 22nd / 30th schedule) ──
    if (freq.type === "weekly" && freq.amount && freq.amount > 0) {
      const weeklyAmt = freq.amount;
      if (!txDate) continue;

      const paymentsElapsed = countWeeklyPaymentDates(txDate, today);
      const paidPayments = Math.floor((l.paid ?? 0) / weeklyAmt);
      const overduePayments = Math.max(paymentsElapsed - paidPayments, 0);
      // Actual days since the most-recent missed payment date (for 2%/day fee)
      const currentWeeklyDue = getCurrentWeeklyPaymentDate(txDate, today);
      const loanWeeklyDaysLate = currentWeeklyDue ? differenceInCalendarDays(today, currentWeeklyDue) : 1;

      if (overduePayments > 0) {
        const overdueTotal = calcOverdueTotal(weeklyAmt, overduePayments, 7, loanWeeklyDaysLate);
        const firstMissedDue = getNthWeeklyPaymentDate(txDate, paidPayments + 1);
        items.push({
          key: `loan-weekly-overdue-${l.id}`,
          id: l.id, loanId: l.loanId, type: "loan",
          label: `Weekly Payment — ₹${weeklyAmt.toLocaleString("en-IN")}/week`,
          subLabel: `${overduePayments} missed payment${overduePayments > 1 ? "s" : ""} · +1%/day late fee`,
          outstanding: overdueTotal,
          dueDate: firstMissedDue,
          isOverdue: true,
          earlyDiscount: 0,
        });
      } else {
        const currentDue = getCurrentWeeklyPaymentDate(txDate, today);
        const isDueToday = currentDue && differenceInCalendarDays(today, currentDue) === 0;
        const nextDue = isDueToday ? currentDue! : getNextWeeklyPaymentDate(txDate, today);
        items.push({
          key: `loan-weekly-${l.id}`,
          id: l.id, loanId: l.loanId, type: "loan",
          label: `Weekly Payment — ₹${weeklyAmt.toLocaleString("en-IN")}/week`,
          subLabel: isDueToday
            ? "Due today"
            : nextDue
              ? `Next payment ${formatDate(nextDue.toISOString())}`
              : "No upcoming payment",
          outstanding: weeklyAmt,
          dueDate: nextDue,
          isOverdue: false,
          earlyDiscount: 0,
        });
      }
      continue;
    }

    // ── Standard (lump-sum) loan ──
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
    if (!isOverdue && daysUntilDue !== null && daysUntilDue > EARLY_PAYMENT_WINDOW_DAYS) {
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
      id: l.id, loanId: l.loanId, type: "loan",
      label: `${formatCurrency(l.principal)} Loan`,
      subLabel: dueDate
        ? isOverdue
          ? `Overdue since ${formatDate(dueDate.toISOString())}`
          : `Due ${formatDate(dueDate.toISOString())}`
        : "No due date set",
      outstanding, dueDate, isOverdue, earlyDiscount,
    });
  }

  // ── EMI loans ──
  for (const e of emiLoans ?? []) {
    if (e.status === "Clear") continue;
    if (isPayDailyLoan((e as any).whatsapp, e.notes)) continue;

    const freq = parsePaymentFrequency(e.notes, (e as any).whatsapp);
    const txDate = e.transactionDate ? new Date(e.transactionDate + "T00:00:00Z") : null;

    // ── Weekly EMI (8th / 15th / 22nd / 30th schedule) ──
    // Uses fixed monthly payment dates instead of 7-day rolling cycles.
    if (freq.type === "weekly" && freq.amount && freq.amount > 0) {
      const weeklyAmt = freq.amount;
      if (!txDate) continue;

      const currentWeekDue = getCurrentWeeklyPaymentDate(txDate, today);
      const daysLate = currentWeekDue ? differenceInCalendarDays(today, currentWeekDue) : 0;

      // Date-based overdue: for each elapsed 8/15/22/30 period, sum paidDates amounts
      // within that period window. Periods with < 90% of weeklyAmt covered are overdue.
      const weeklyPaidEntries = (e.paidDates ?? []).map(entry => {
        const parts = entry.split(":");
        return { date: parts[0] ?? "", amount: Number(parts[1]) || 0 };
      }).filter(pe => pe.date.length >= 8);

      const overdueCount = (() => {
        let count = 0;
        // Build date strings without timezone conversion to avoid IST (+5:30) shifting
        // new Date(yr, mo, day).toISOString() to the previous calendar day in UTC.
        const txDateStr = e.transactionDate ?? "";
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        let prevStr = txDateStr;
        let yr = txDate.getFullYear(), mo = txDate.getMonth();
        done: for (let mi = 0; mi < 36; mi++) {
          for (const day of MONTHLY_PAYMENT_DAYS) {
            const dueDateStr = `${yr}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            if (dueDateStr <= txDateStr) continue;
            if (dueDateStr > todayStr) break done;
            const periodPaid = weeklyPaidEntries
              .filter(pe => pe.date > prevStr && pe.date <= dueDateStr)
              .reduce((s, pe) => s + pe.amount, 0);
            if (periodPaid < weeklyAmt * 0.9) count++;
            prevStr = dueDateStr;
          }
          mo++; if (mo > 11) { mo = 0; yr++; }
        }
        return count;
      })();

      if (overdueCount > 0) {
        // Use actual daysLate (calendar days since most recent due date) for the fee.
        const overdueTotal = calcOverdueTotal(weeklyAmt, overdueCount, 7, Math.max(daysLate, 1));
        items.push({
          key: `emi-weekly-${e.id}`,
          id: e.id, loanId: (e as any).emiId, type: "emi",
          label: `${formatCurrency(e.principal)} EMI (₹${weeklyAmt.toLocaleString("en-IN")}/week)`,
          subLabel: `${overdueCount} missed payment${overdueCount > 1 ? "s" : ""} · ${daysLate} day${daysLate !== 1 ? "s" : ""} overdue`,
          outstanding: overdueTotal,
          dueDate: currentWeekDue,
          isOverdue: true,
          earlyDiscount: 0,
        });
      } else {
        const isDueToday = currentWeekDue && daysLate === 0;
        const upcomingDue = isDueToday
          ? currentWeekDue!
          : getNextWeeklyPaymentDate(txDate, today);
        items.push({
          key: `emi-weekly-${e.id}`,
          id: e.id, loanId: (e as any).emiId, type: "emi",
          label: `${formatCurrency(e.principal)} EMI (₹${weeklyAmt.toLocaleString("en-IN")}/week)`,
          subLabel: isDueToday
            ? "Due today"
            : upcomingDue
              ? `Next payment ${formatDate(upcomingDue.toISOString())}`
              : "No upcoming payment",
          outstanding: weeklyAmt,
          dueDate: upcomingDue,
          isOverdue: false,
          earlyDiscount: 0,
        });
      }
      continue;
    }

    // ── Standard monthly EMI ──
    const monthly = e.monthlyPayment ?? 0;
    if (monthly <= 0) continue;
    const dueDate = e.nextPaymentDate ? new Date(e.nextPaymentDate) : null;
    const isOverdue = !!(dueDate && dueDate < now);
    // Add 2%/day late fee when overdue (use pre-computed server lateFees, which equals monthly × 0.02 × lateDays)
    const emiLateFees = isOverdue ? (e.lateFees ?? 0) : 0;
    items.push({
      key: `emi-${e.id}`,
      id: e.id, loanId: (e as any).emiId, type: "emi",
      label: `${formatCurrency(e.principal)} EMI`,
      subLabel: dueDate
        ? isOverdue
          ? `Overdue since ${formatDate(e.nextPaymentDate!)}`
          : `Next payment ${formatDate(e.nextPaymentDate!)}`
        : "No due date",
      outstanding: monthly + emiLateFees, dueDate, isOverdue,
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
  const [, setLocation] = useLocation();
  const detailHref =
    item.type === "loan" ? `/loans/${item.id}` : `/emi-loans/${item.id}`;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors cursor-pointer ${
          item.isOverdue
            ? "border-destructive/40 bg-destructive/5"
            : "border-border bg-card"
        } ${selected ? "ring-2 ring-primary/30" : ""}`}
        onClick={() => setLocation(detailHref)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setLocation(detailHref); }}
      >
        {showCheckbox && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              aria-label={`Select ${item.label}`}
            />
          </div>
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
          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
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
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                const allKeys = items.map((i) => i.key);
                const allSel = allKeys.every((k) => selected.has(k));
                setSelected(allSel ? new Set() : new Set(allKeys));
              }}
            >
              {items.every((i) => selected.has(i.key))
                ? "Deselect All"
                : `Select All (${items.length})`}
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
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                const allKeys = items.map((i) => i.key);
                const allSel = allKeys.every((k) => selected.has(k));
                setSelected(allSel ? new Set() : new Set(allKeys));
              }}
            >
              {items.every((i) => selected.has(i.key))
                ? "Deselect All"
                : `Select All (${items.length})`}
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

function RequestDetailDialog({
  request,
  open,
  onOpenChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!request) return null;
  const isEmi = request.type === "EMI";
  const statusColor =
    request.status === "Pending"
      ? "bg-amber-50 text-amber-700 border border-amber-200"
      : request.status === "Approved"
        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
        : "bg-red-50 text-red-700 border border-red-200";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {requestStatusIcon[request.status as keyof typeof requestStatusIcon]}
            Loan Request Details
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
              {request.status}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Amount</span>
            <span className="text-sm font-bold font-numeric">{formatCurrency(request.amount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Type</span>
            <span className="text-sm font-medium">{isEmi ? "EMI Loan" : "Regular Loan"}</span>
          </div>
          {isEmi ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tenure</span>
              <span className="text-sm font-medium">{request.tenureMonths ?? "?"} months</span>
            </div>
          ) : request.tenureDays > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tenure</span>
              <span className="text-sm font-medium">{request.tenureDays} days</span>
            </div>
          ) : null}
          {request.purpose && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Purpose</span>
              <span className="text-sm rounded-lg bg-muted/40 px-3 py-2">{request.purpose}</span>
            </div>
          )}
          {request.createdAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Requested on</span>
              <span className="text-sm">{formatDate(request.createdAt)}</span>
            </div>
          )}
          {request.adminNote && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Admin note</span>
              <span className="text-sm rounded-lg bg-muted/40 px-3 py-2">{request.adminNote}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({ request }: { request: any }) {
  const [open, setOpen] = useState(false);
  const isEmi = request.type === "EMI";
  return (
    <>
      <button
        type="button"
        className="w-full flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm text-left hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {requestStatusIcon[request.status as keyof typeof requestStatusIcon]}
          <div className="min-w-0">
            <span className="font-semibold font-numeric">
              {formatCurrency(request.amount)}
            </span>
            <span className="text-muted-foreground ml-2">
              ·{" "}
              {isEmi
                ? `${request.tenureMonths ?? "?"} months EMI`
                : request.tenureDays > 0
                  ? `${request.tenureDays} days`
                  : "EMI"}
            </span>
            {request.purpose && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {request.purpose}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              request.status === "Pending"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : request.status === "Approved"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {request.status}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </button>
      <RequestDetailDialog request={request} open={open} onOpenChange={setOpen} />
    </>
  );
}

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
          <RequestCard key={r.id} request={r} />
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

const PAID_PAGE_SIZE = 15;

function AlreadyPaidSection({
  loans,
  emiLoans,
}: {
  loans: Loan[];
  emiLoans: EmiLoan[];
}) {
  const [page, setPage] = useState(0);

  const paidLoans = loans.filter((l) => l.status === "Clear");
  const paidEmi = emiLoans.filter((e) => e.status === "Clear");
  const allPaid = [
    ...paidLoans.map((l) => ({ kind: "loan" as const, item: l })),
    ...paidEmi.map((e) => ({ kind: "emi" as const, item: e })),
  ];
  const total = allPaid.length;

  if (total === 0) return null;

  const totalPages = Math.ceil(total / PAID_PAGE_SIZE);
  const pageItems = allPaid.slice(page * PAID_PAGE_SIZE, (page + 1) * PAID_PAGE_SIZE);

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold text-sm">
            Already Paid ({total})
          </span>
        </div>
        {totalPages > 1 && (
          <span className="text-xs text-muted-foreground">
            Page {page + 1}/{totalPages}
          </span>
        )}
      </div>

      <div className="divide-y">
        {pageItems.map(({ kind, item }) =>
          kind === "loan" ? (
            <div
              key={item.id}
              className="flex items-center justify-between px-4 py-3 bg-emerald-50/30 text-sm"
            >
              <div>
                <span className="font-semibold font-numeric">
                  {formatCurrency((item as Loan).principal)} Loan
                </span>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Paid on {(item as Loan).dateOfPartPayment
                    ? formatDate((item as Loan).dateOfPartPayment!)
                    : (item as Loan).returnDate
                      ? formatDate((item as Loan).returnDate!)
                      : "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold font-numeric text-emerald-700">
                  {(item as Loan).paid != null ? formatCurrency((item as Loan).paid!) : "—"}
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2 mt-0.5" asChild>
                  <Link href={`/loans/${item.id}`}>
                    Details <ChevronRight className="ml-0.5 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={item.id}
              className="flex items-center justify-between px-4 py-3 bg-emerald-50/30 text-sm"
            >
              <div>
                <span className="font-semibold font-numeric">
                  {formatCurrency((item as EmiLoan).principal)} EMI Loan
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
                  {(item as EmiLoan).monthlyPayment != null
                    ? `${formatCurrency((item as EmiLoan).monthlyPayment!)}/mo`
                    : "—"}
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2 mt-0.5" asChild>
                  <Link href={`/emi-loans/${item.id}`}>
                    Details <ChevronRight className="ml-0.5 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          )
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-t gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            {page * PAID_PAGE_SIZE + 1}–{Math.min((page + 1) * PAID_PAGE_SIZE, total)} of {total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </Button>
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
  const [dateRange, setDateRange] = useState<[number, number] | null>(null);
  const now = new Date();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Filter out pay-daily loans from display
  const displayLoans = loans.filter((l) => !isPayDailyLoan(l.whatsapp, (l as any).notes));

  // Compute due/repayment timestamp for a loan (used for date range slider)
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
  const { minTs, maxTs } = useMemo(() => {
    const dates = displayLoans.map(getLoanDueTs).filter(Boolean) as number[];
    if (dates.length === 0) return { minTs: 0, maxTs: 0 };
    return { minTs: Math.min(...dates), maxTs: Math.max(...dates) };
  }, [displayLoans]);

  // Initialise date range when data loads
  useEffect(() => {
    if (minTs > 0 && maxTs > 0 && dateRange === null) {
      setDateRange([minTs, maxTs]);
    }
  }, [minTs, maxTs]);

  const effectiveDateRange = dateRange ?? [minTs, maxTs];

  // Filter displayLoans by repayment/due date range
  const dateFilteredLoans = useMemo(() => {
    if (minTs === 0 && maxTs === 0) return displayLoans;
    const [start, end] = effectiveDateRange;
    return displayLoans.filter((l) => {
      const dueTs = getLoanDueTs(l);
      if (dueTs === null) return true;
      return dueTs >= start && dueTs <= end;
    });
  }, [displayLoans, effectiveDateRange, minTs, maxTs]);

  const selectedItems = dateFilteredLoans.filter((l) => selected.has(l.id));
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
      {/* Date range slider */}
      {minTs > 0 && maxTs > 0 && minTs !== maxTs && (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground text-sm">
              <CalendarRange className="h-3.5 w-3.5" /> Date Range
            </span>
            <button
              className="text-xs underline"
              onClick={() => setDateRange([minTs, maxTs])}
            >
              Reset
            </button>
          </div>
          <Slider
            min={minTs}
            max={maxTs}
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
        {dateFilteredLoans.map((loan) => (
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

// ─── Action Required Popup (shown on every page reload) ──────────────────────

const ACTION_POPUP_SS = "borrowapp_action_popup_dismissed";

// Module-level flag: false on every hard page reload (module re-evaluation),
// persists within the same page load across in-app navigation.
// This guarantees the popup always appears on reload but stays dismissed once
// the user closes it during the current session.
let popupDismissedThisLoad = false;

type UrgentItem = RepayItem & { _urgentType: "overdue" | "coming-up" };

function ActionRequiredPopup({ items }: { items: UrgentItem[] }) {
  const [dismissed, setDismissed] = useState(() => popupDismissedThisLoad);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [repayItem, setRepayItem] = useState<RepayItem | null>(null);

  if (dismissed || items.length === 0) return null;

  const dismiss = () => {
    popupDismissedThisLoad = true;
    setDismissed(true);
  };

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const selectedItems = items.filter((i) => selected.has(i.key));
  const bulkTotal = selectedItems.reduce((s, i) => s + i.outstanding, 0);
  const bulkDiscountTotal = selectedItems.reduce((s, i) => s + i.earlyDiscount, 0);
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.key));
  const hasOverdue = items.some((i) => i._urgentType === "overdue");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={dismiss}
      />
      {/* Popup card — centered horizontally and vertically via CSS transform */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "85dvh" }}>
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            hasOverdue ? "bg-destructive/5" : "bg-amber-50"
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`h-4 w-4 shrink-0 ${hasOverdue ? "text-destructive" : "text-amber-600"}`}
            />
            <span className="font-semibold text-sm">Action Required</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                hasOverdue
                  ? "bg-destructive text-white"
                  : "bg-amber-200 text-amber-800"
              }`}
            >
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

        {/* Items list */}
        <div className="overflow-y-auto flex-1 divide-y divide-border/40">
          {items.map((item) => {
            const isOverdue = item._urgentType === "overdue";
            return (
              <div
                key={item.key}
                className={`flex items-center gap-3 px-3 py-2.5 ${
                  isOverdue ? "bg-destructive/[0.03]" : "bg-amber-50/30"
                }`}
              >
                <Checkbox
                  checked={selected.has(item.key)}
                  onCheckedChange={() => toggle(item.key)}
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    {isOverdue ? (
                      <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                    ) : (
                      <Clock className="h-3 w-3 text-amber-600 shrink-0" />
                    )}
                    <p className="text-xs font-semibold truncate">{item.label}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5 pl-4">
                    {item.subLabel}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`font-bold text-sm font-numeric ${
                      isOverdue ? "text-destructive" : "text-amber-700"
                    }`}
                  >
                    {formatCurrency(item.outstanding)}
                  </span>
                  <Button
                    size="sm"
                    className="h-6 text-[11px] px-2 bg-emerald-700 hover:bg-emerald-800 text-white"
                    onClick={() => setRepayItem(item)}
                  >
                    <Banknote className="h-3 w-3 mr-1" />
                    Pay
                  </Button>
                </div>
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
            onClick={() =>
              setSelected(
                allSelected ? new Set() : new Set(items.map((i) => i.key)),
              )
            }
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          <div className="flex-1" />
          {selected.size > 1 && (
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => setBulkOpen(true)}
            >
              <Banknote className="h-3 w-3 mr-1" />
              Pay {selected.size} items
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={dismiss}
          >
            Dismiss
          </Button>
        </div>
      </div>

      {repayItem && (
        <RepayDialog
          open={!!repayItem}
          onOpenChange={(open) => {
            if (!open) setRepayItem(null);
          }}
          label={repayItem.label}
          outstanding={repayItem.outstanding}
          earlyDiscount={repayItem.earlyDiscount}
          loanId={repayItem.loanId}
        />
      )}
      <BulkRepayDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        total={bulkTotal}
        count={selected.size}
        discountTotal={bulkDiscountTotal}
      />
    </>
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
    () =>
      allItems
        .filter((i) => i.isOverdue)
        .sort((a, b) => {
          // Most overdue first (oldest due date first)
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.getTime() - b.dueDate.getTime();
        }),
    [allItems],
  );

  const comingUpItems = useMemo(
    () => {
      const now = new Date();
      return allItems
        .filter((i) => {
          if (i.isOverdue) return false;
          if (!i.dueDate) return false;
          const daysUntil = differenceInCalendarDays(i.dueDate, now);
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

  // Build urgent items for the Action Required popup (overdue + coming-up, sorted by date)
  const urgentItems = useMemo<UrgentItem[]>(
    () => [
      ...overdueItems.map((i) => ({ ...i, _urgentType: "overdue" as const })),
      ...comingUpItems.map((i) => ({ ...i, _urgentType: "coming-up" as const })),
    ].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.getTime() - b.dueDate.getTime();
    }),
    [overdueItems, comingUpItems],
  );

  const hasOverdue = overdueItems.length > 0;
  const defaultTab = hasOverdue ? "overdue" : "coming-up";

  // ── Tab persistence (browser back-navigation fix) ──────────────────────────
  // Active tab is stored in sessionStorage so navigating to a loan detail and
  // pressing Back restores the tab the user was on, instead of jumping to "overdue".
  const PORTAL_TAB_SS = "borrowapp_portal_tab";
  const [activeTab, setActiveTab] = useState<string>(() => {
    try { return sessionStorage.getItem(PORTAL_TAB_SS) ?? "coming-up"; } catch { return "coming-up"; }
  });
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    try { sessionStorage.setItem(PORTAL_TAB_SS, tab); } catch {}
  };
  // On first load (no session choice yet), sync to the data-driven defaultTab
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(PORTAL_TAB_SS)) setActiveTab(defaultTab);
    } catch {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

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
        (sum, e) => {
          // Use remaining PRINCIPAL (not total future payments which include interest).
          // principalPerMonth × remainingMonths is the most accurate when both are set.
          // Proportional fallback: principal × remainingMonths / tenureMonths.
          const rem = e.remainingMonths;
          if (rem == null) return sum; // uninitialized — skip rather than overstate
          const remClamped = Math.max(rem, 0);
          if (e.principalPerMonth != null) {
            return sum + e.principalPerMonth * remClamped;
          }
          if (e.tenureMonths > 0) {
            return sum + Math.round((e.principal ?? 0) * remClamped / e.tenureMonths);
          }
          return sum + (e.principal ?? 0);
        },
        0,
      ),
    [activeLoans, activeEmi],
  );

  // Credit limit utilisation — for EMI loans use remaining principal (principalPerMonth × remainingMonths)
  // when tracking has been initialised; fall back to original principal for legacy rows.
  const usedPrincipal = useMemo(
    () =>
      activeLoans.reduce((s, l) => s + (l.principal ?? 0), 0) +
      activeEmi.reduce((s, e) => {
        if (e.principalPerMonth != null && e.remainingMonths != null) {
          return s + e.principalPerMonth * Math.max(e.remainingMonths, 0);
        }
        return s + (e.principal ?? 0); // legacy fallback
      }, 0),
    [activeLoans, activeEmi],
  );
  const availableCredit =
    creditLimit != null ? Math.max(creditLimit - usedPrincipal, 0) : null;
  // Not capped at 100 so we can show ">100%" when over limit
  const usedPct =
    creditLimit && creditLimit > 0
      ? Math.round((usedPrincipal / creditLimit) * 100)
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

      {/* Action Required popup (shown once per session on login) */}
      {!isLoading && (
        <ActionRequiredPopup items={urgentItems} />
      )}

      {/* Summary Cards — drawing layout:
          [Loans] [EMI  ] [Credit Pie ↕ row-span-2]
          [Total Due  col-span-2   ] [Credit Pie   ] */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-1.5">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl col-span-3" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {/* Row 1 Col 1 — Loans count */}
          <Card className="shadow-sm border-border/60">
            <CardContent className="px-2 py-2 flex flex-col items-center justify-center text-center gap-0.5">
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="text-xl font-bold font-numeric leading-none">{activeLoans.length}</div>
              <p className="text-[10px] text-muted-foreground leading-tight">Loans</p>
            </CardContent>
          </Card>

          {/* Row 1 Col 2 — EMI count */}
          <Card className="shadow-sm border-border/60">
            <CardContent className="px-2 py-2 flex flex-col items-center justify-center text-center gap-0.5">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="text-xl font-bold font-numeric leading-none">{activeEmi.length}</div>
              <p className="text-[10px] text-muted-foreground leading-tight">EMI</p>
            </CardContent>
          </Card>

          {/* Col 3 Rows 1-2 — Credit Limit donut (spans 2 rows, freeing left col for Total Due) */}
          <Card
            className={`row-span-2 shadow-sm ${isOverLimit ? "border-destructive/40 bg-destructive/5" : "border-border/60"}`}
          >
            <CardContent className="h-full px-1 py-2 flex flex-col items-center justify-center text-center gap-0.5">
              {/* Donut 64×64 — embed fill in data for reliable Recharts colors */}
              <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
                {(() => {
                  const pieData =
                    creditLimit != null && creditLimit > 0
                      ? [
                          { name: "Used",      value: Math.min(usedPrincipal, creditLimit), fill: pctToHex(usedPct ?? 0) },
                          { name: "Available", value: Math.max(creditLimit - usedPrincipal, 0), fill: "#e2e8f0" },
                        ]
                      : [{ name: "Empty", value: 1, fill: "#e2e8f0" }];
                  return (
                    <PieChart width={64} height={64} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie
                        data={pieData}
                        cx={32} cy={32}
                        innerRadius={18} outerRadius={28}
                        strokeWidth={0}
                        startAngle={90} endAngle={-270}
                        dataKey="value"
                        isAnimationActive={false}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  );
                })()}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span
                    className={`text-[9px] font-bold font-numeric leading-none ${isOverLimit ? "text-destructive" : "text-foreground"}`}
                  >
                    {usedPct != null ? `${usedPct}%` : "—"}
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground leading-tight">Credit Limit</p>
              {creditLimit != null && (
                <div className="flex flex-col items-center gap-0">
                  <p
                    className={`text-[9px] font-numeric leading-tight ${isOverLimit ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                  >
                    {formatCurrency(availableCredit ?? 0)} free
                  </p>
                  <p className="text-[8px] text-muted-foreground/60 font-numeric leading-tight">
                    of {formatCurrency(creditLimit)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Row 2 Cols 1-2 — Total Outstanding (sits left of pie which spans both rows) */}
          <Card className="col-span-2 shadow-sm border-border/60">
            <CardContent className="px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground leading-tight">Total Due</p>
              </div>
              <div className="text-base font-bold font-numeric leading-none text-destructive">
                {formatCurrency(totalOutstanding)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
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
          <AlreadyPaidSection loans={loans ?? []} emiLoans={emiLoans ?? []} />
        </TabsContent>
      </Tabs>

      <LoanRequestDialog
        open={loanRequestOpen}
        onOpenChange={setLoanRequestOpen}
        borrowerName={name ?? ""}
        borrowerPhone={borrowerPhone}
        availableCredit={availableCredit}
        creditLimit={creditLimit}
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
