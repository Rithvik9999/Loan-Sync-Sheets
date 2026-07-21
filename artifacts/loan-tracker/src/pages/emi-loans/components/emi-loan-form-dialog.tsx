import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useLocation } from "wouter";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChevronsUpDown, Check, Calculator, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatCurrency } from "@/lib/utils";

export interface EmiLoan {
  id: string;
  /** Human-readable EMI loan ID (e.g. "E-0001"), derived from sheet row position. */
  emiId: string;
  rowNumber: number;
  name: string;
  statusNotes: string;
  nextPaymentDate: string | null;
  monthlyPayment: number | null;
  transactionDate: string | null;
  principal: number;
  tenureMonths: number;
  flatFee: number | null;
  interestPct: number | null;
  interestPerMonth: number | null;
  totalInterest: number | null;
  discountPerMonth: number;
  principalPerMonth: number | null;
  status: "Pending" | "Clear" | "Temp" | "Archived";
  whatsapp: string;
  lateFees: number | null;
  remainingMonths: number | null;
  notes: string;
  borrowerId?: string | null;
  /** Calendar days overdue (server-computed). 0 when on time or cleared. */
  lateDays?: number;
  /** Payment history: pipe-separated "YYYY-MM-DD:amount" entries from column T. */
  paidDates?: string[];
  /** Custom daily instalment override stored in sheet column U. null = use monthlyPayment ÷ 30. */
  dailyAmount?: number | null;
  /** Custom weekly instalment override stored in sheet column V. null = use monthlyPayment ÷ 4 (4 weekly instalments = 1 month). */
  weeklyAmount?: number | null;
  /** Custom bimonthly instalment override stored in sheet column W. null = use monthlyPayment ÷ 2. */
  bimonthlyAmount?: number | null;
  /** ISO datetime of when this EMI loan was created. Null for legacy rows. */
  createdAt?: string | null;
  /** ISO datetimes for each paidDates entry (same order). */
  paidTimestamps?: string[];
}

const emiLoanSchema = z.object({
  name: z.string().min(1, "Borrower name is required"),
  transactionDate: z.string().min(1, "Transaction date is required"),
  principal: z.coerce.number().min(0.01, "Principal must be greater than 0"),
  tenureMonths: z.coerce.number().min(0.1, "Tenure must be greater than 0"),
  whatsapp: z.string().optional(),
  discountPerMonth: z.coerce.number().optional(),
  statusNotes: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["Pending", "Clear", "Temp", "Archived"]).optional(),
  customDailyAmount: z.coerce.number().min(0).optional(),
  customWeeklyAmount: z.coerce.number().min(0).optional(),
  customBimonthlyAmount: z.coerce.number().min(0).optional(),
});

/** Extract custom pay-daily / pay-weekly amounts from a notes string (used by regular Loans, not EMI). */
export function parsePayAmountsFromNotes(notes: string | undefined): {
  daily: number | undefined;
  weekly: number | undefined;
} {
  const text = notes ?? "";
  const dailyMatch = text.match(/pay\s+daily\s+(\d+)/i);
  const weeklyMatch = text.match(/pay\s+weekly\s+(\d+)/i);
  return {
    daily: dailyMatch ? Number(dailyMatch[1]) : undefined,
    weekly: weeklyMatch ? Number(weeklyMatch[1]) : undefined,
  };
}

type EmiLoanFormValues = z.infer<typeof emiLoanSchema>;

interface EmiLoanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan?: EmiLoan;
  defaultName?: string;
}

async function fetchEmiLoans(): Promise<EmiLoan[]> {
  const res = await fetch("/api/emi-loans", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch EMI loans");
  return res.json();
}

async function createEmiLoan(data: EmiLoanFormValues & { dailyAmount?: number | null; weeklyAmount?: number | null; bimonthlyAmount?: number | null }): Promise<EmiLoan> {
  const res = await fetch("/api/emi-loans", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      transactionDate: data.transactionDate,
      principal: data.principal,
      tenureMonths: data.tenureMonths,
      whatsapp: data.whatsapp || null,
      discountPerMonth: data.discountPerMonth || null,
      status: data.status || "Pending",
      statusNotes: data.statusNotes || null,
      notes: data.notes || null,
      dailyAmount: data.dailyAmount ?? null,
      weeklyAmount: data.weeklyAmount ?? null,
      bimonthlyAmount: data.bimonthlyAmount ?? null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create EMI loan" }));
    throw new Error(err.error || "Failed to create EMI loan");
  }
  return res.json();
}

async function updateEmiLoan(id: string, data: Partial<EmiLoanFormValues> & { dailyAmount?: number | null; weeklyAmount?: number | null; bimonthlyAmount?: number | null }): Promise<EmiLoan> {
  const res = await fetch(`/api/emi-loans/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      transactionDate: data.transactionDate,
      principal: data.principal,
      tenureMonths: data.tenureMonths,
      whatsapp: data.whatsapp || null,
      discountPerMonth: data.discountPerMonth || null,
      status: data.status,
      statusNotes: data.statusNotes || null,
      notes: data.notes || null,
      dailyAmount: data.dailyAmount ?? null,
      weeklyAmount: data.weeklyAmount ?? null,
      bimonthlyAmount: data.bimonthlyAmount ?? null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to update EMI loan" }));
    throw new Error(err.error || "Failed to update EMI loan");
  }
  return res.json();
}

/**
 * Marks one monthly EMI payment as paid.
 * Decrements remainingMonths, advances nextPaymentDate, and sets status=Clear when tenure is complete.
 */
export async function markEmiLoanMonthlyPaid(
  id: string,
  paidDate: string,
  paidAmount?: number,
): Promise<EmiLoan> {
  const res = await fetch(`/api/emi-loans/${id}/pay`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paidDate, paidAmount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to mark EMI payment" }));
    throw new Error(err.error || "Failed to mark EMI payment");
  }
  return res.json();
}

export const EMI_LOANS_QUERY_KEY = ["emi-loans"];
export const emiLoanQueryKey = (id: string) => ["emi-loans", id];

export { fetchEmiLoans, createEmiLoan, updateEmiLoan };

export default function EmiLoanFormDialog({ open, onOpenChange, loan, defaultName }: EmiLoanFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const isEditing = !!loan;
  const [namePopoverOpen, setNamePopoverOpen] = useState(false);
  const [nameSearch, setNameSearch] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [primaryFrequency, setPrimaryFrequency] = useState<"monthly" | "daily" | "weekly" | "bimonthly">("monthly");

  const { data: emiLoans } = useQuery({
    queryKey: EMI_LOANS_QUERY_KEY,
    queryFn: fetchEmiLoans,
    enabled: open,
  });

  // Derive unique borrower names from existing EMI loans
  const uniqueNames: { name: string; phone: string }[] = (() => {
    const seen = new Set<string>();
    const result: { name: string; phone: string }[] = [];
    for (const l of emiLoans ?? []) {
      const key = l.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        const phone = (l.whatsapp ?? "").split("\n")[0].trim();
        result.push({ name: l.name.trim(), phone });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  })();

  const defaults = (): EmiLoanFormValues => ({
    name: loan?.name || defaultName || "",
    transactionDate: loan?.transactionDate || format(new Date(), "yyyy-MM-dd"),
    principal: loan?.principal || 0,
    tenureMonths: loan?.tenureMonths || 12,
    whatsapp: loan?.whatsapp || "",
    discountPerMonth: loan?.discountPerMonth || 0,
    statusNotes: loan?.statusNotes || "",
    notes: loan?.notes || "",
    status: loan?.status || "Pending",
    // Use dedicated sheet columns U/V/W when editing; undefined = let sheet/UI compute default
    customDailyAmount: loan?.dailyAmount ?? undefined,
    customWeeklyAmount: loan?.weeklyAmount ?? undefined,
    customBimonthlyAmount: loan?.bimonthlyAmount ?? undefined,
  });

  const form = useForm<EmiLoanFormValues>({
    resolver: zodResolver(emiLoanSchema),
    defaultValues: defaults(),
  });

  async function onSubmit(data: EmiLoanFormValues) {
    setIsPending(true);
    // Pass custom daily/weekly amounts directly to API (stored in sheet cols U/V)
    const payload = {
      ...data,
      dailyAmount: data.customDailyAmount && data.customDailyAmount > 0 ? Math.round(data.customDailyAmount) : null,
      weeklyAmount: data.customWeeklyAmount && data.customWeeklyAmount > 0 ? Math.round(data.customWeeklyAmount) : null,
      bimonthlyAmount: data.customBimonthlyAmount && data.customBimonthlyAmount > 0 ? Math.round(data.customBimonthlyAmount) : null,
    };
    try {
      if (isEditing) {
        const updated = await updateEmiLoan(loan.id, payload);
        queryClient.setQueryData(emiLoanQueryKey(loan.id), updated);
        queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
        toast({ title: "EMI Loan updated", description: "The sheet has recalculated the computed fields." });
        onOpenChange(false);
      } else {
        const newLoan = await createEmiLoan(payload);
        queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
        toast({ title: "EMI Loan recorded", description: "Added to the EMI sheet." });
        form.reset();
        onOpenChange(false);
        setLocation(`/emi-loans/${newLoan.id}`);
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "An error occurred." });
    } finally {
      setIsPending(false);
    }
  }

  const inferEmiFrequency = (l?: EmiLoan): typeof primaryFrequency => {
    if (l?.dailyAmount && l.dailyAmount > 0) return "daily";
    if (l?.weeklyAmount && l.weeklyAmount > 0) return "weekly";
    if (l?.bimonthlyAmount && l.bimonthlyAmount > 0) return "bimonthly";
    return "monthly";
  };

  useEffect(() => {
    if (open) {
      form.reset(defaults());
      setNameSearch("");
      setPrimaryFrequency(inferEmiFrequency(loan));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loan, defaultName]);

  const currentName = form.watch("name");
  const filteredNames = uniqueNames.filter((b) =>
    b.name.toLowerCase().includes(nameSearch.toLowerCase()),
  );

  const watchedPrincipal = form.watch("principal");
  const watchedTenure = form.watch("tenureMonths");
  const emiPreview = useMemo(() => {
    const p = Number(watchedPrincipal);
    const t = Number(watchedTenure);
    if (!p || !t || p <= 0 || t <= 0) return null;
    // Estimate using 2% per month flat interest (mirrors lending setup)
    const monthlyRate = 0.02;
    const interestPerMonth = Math.ceil(p * monthlyRate);
    const principalPerMonth = Math.ceil(p / t);
    const monthlyPayment = interestPerMonth + principalPerMonth;
    const totalInterest = interestPerMonth * t;
    const totalAmount = p + totalInterest;
    return { interestPerMonth, principalPerMonth, monthlyPayment, totalInterest, totalAmount };
  }, [watchedPrincipal, watchedTenure]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit EMI Loan" : "Record EMI Loan"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Only input fields are editable — computed fields (fees, interest, monthly payment) are recalculated by the sheet."
              : "This writes only the inputs to your EMI sheet. Fees, interest, and the monthly payment are computed automatically."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            {/* Borrower Name Combobox */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Borrower Name</FormLabel>
                  <FormControl>
                    <Popover open={namePopoverOpen} onOpenChange={setNamePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={namePopoverOpen}
                          className="w-full justify-between font-normal"
                        >
                          <span className={cn(!field.value && "text-muted-foreground")}>
                            {field.value || "Select or type borrower name…"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                        {/* Native implementation — avoids cmdk capturing touch events and blocking scroll */}
                        <div className="flex items-center border-b px-3">
                          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                          <input
                            className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                            placeholder="Search or type a new name…"
                            value={nameSearch}
                            autoFocus
                            onChange={(e) => {
                              setNameSearch(e.target.value);
                              field.onChange(e.target.value);
                            }}
                          />
                        </div>
                        {nameSearch && !uniqueNames.some(
                          (b) => b.name.toLowerCase() === nameSearch.toLowerCase(),
                        ) && (
                          <div className="px-3 py-2 text-xs text-muted-foreground border-b">
                            Press Enter or select below to add as new borrower
                          </div>
                        )}
                        <div
                          className="max-h-52 overflow-y-scroll overscroll-contain py-1"
                          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchMove={(e) => e.stopPropagation()}
                        >
                          {filteredNames.length === 0 ? (
                            <div className="py-3 text-center text-sm text-muted-foreground">
                              {nameSearch ? `Record as new borrower: "${nameSearch}"` : "No borrowers found."}
                            </div>
                          ) : (
                            filteredNames.map((b) => (
                              <button
                                key={b.name}
                                type="button"
                                className="flex w-full items-center px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
                                onClick={() => {
                                  field.onChange(b.name);
                                  if (!form.getValues("whatsapp") && b.phone) {
                                    form.setValue("whatsapp", b.phone);
                                  }
                                  setNameSearch("");
                                  setNamePopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    currentName?.toLowerCase() === b.name.toLowerCase()
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                <span>{b.name}</span>
                                {b.phone && (
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {b.phone}
                                  </span>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="principal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Principal (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="5000" {...field} />
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
                    <FormLabel>Tenure (Months)</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" min="0.1" placeholder="12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="transactionDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transaction Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="whatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone / WhatsApp</FormLabel>
                    <FormControl>
                      <Input placeholder="9876543210" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="discountPerMonth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount per Month (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormDescription>Negative for a discount, positive for an extra charge per month.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Repayment Frequency */}
            <div className="space-y-2">
              <FormLabel>Repayment Frequency</FormLabel>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { value: "monthly", label: "Monthly" },
                    { value: "bimonthly", label: "15 Days" },
                    { value: "weekly", label: "Weekly" },
                    { value: "daily", label: "Daily" },
                  ] as const
                ).map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={primaryFrequency === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPrimaryFrequency(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {primaryFrequency === "monthly"
                  ? "Standard monthly EMI — payment buttons use the auto-computed monthly amount."
                  : `Sets the primary quick-pay button on the detail page. Override the auto-computed ${primaryFrequency} amount below (optional).`}
              </p>
            </div>

            {/* Custom amount for the selected non-monthly frequency */}
            {primaryFrequency === "daily" && (
              <FormField
                control={form.control}
                name="customDailyAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Daily Amount (₹) <span className="text-muted-foreground font-normal">— optional override</span></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        placeholder={
                          form.watch("principal") && form.watch("tenureMonths")
                            ? String(Math.round((Number(form.watch("principal")) * 0.02 + Number(form.watch("principal")) / Number(form.watch("tenureMonths"))) / 30))
                            : "e.g. 250"
                        }
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {primaryFrequency === "weekly" && (
              <FormField
                control={form.control}
                name="customWeeklyAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weekly Amount (₹) <span className="text-muted-foreground font-normal">— optional override</span></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        placeholder={
                          form.watch("principal") && form.watch("tenureMonths")
                            ? String(Math.round((Number(form.watch("principal")) * 0.02 + Number(form.watch("principal")) / Number(form.watch("tenureMonths"))) / 4))
                            : "e.g. 1750"
                        }
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {primaryFrequency === "bimonthly" && (
              <FormField
                control={form.control}
                name="customBimonthlyAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>15-Day Amount (₹) <span className="text-muted-foreground font-normal">— optional override</span></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        placeholder={
                          form.watch("principal") && form.watch("tenureMonths")
                            ? String(Math.round((Number(form.watch("principal")) * 0.02 + Number(form.watch("principal")) / Number(form.watch("tenureMonths"))) / 2))
                            : "e.g. 3750"
                        }
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Clear">Clear</SelectItem>
                      <SelectItem value="Temp">Temp</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="statusNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status Notes (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Next payment 15 Aug…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Any specific terms or context…" className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEditing && emiPreview && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <Calculator className="h-4 w-4" /> Estimated Monthly Breakdown
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">Principal/mo</p>
                    <p className="font-semibold font-numeric">{formatCurrency(emiPreview.principalPerMonth)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">Interest/mo</p>
                    <p className="font-semibold font-numeric">{formatCurrency(emiPreview.interestPerMonth)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">Monthly EMI</p>
                    <p className="font-bold font-numeric text-amber-900 dark:text-amber-200">{formatCurrency(emiPreview.monthlyPayment)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">Total Amount</p>
                    <p className="font-bold font-numeric text-amber-900 dark:text-amber-200">{formatCurrency(emiPreview.totalAmount)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-500">Estimate only (2%/mo flat) — sheet formulas are the source of truth.</p>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Record EMI Loan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
