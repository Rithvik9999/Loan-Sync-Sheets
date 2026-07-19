import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateLoan,
  useUpdateLoan,
  getListLoansQueryKey,
  getGetLoanQueryKey,
  Loan,
  useListLoans,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, differenceInCalendarDays, parseISO } from "date-fns";

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
import { Loader2, ChevronsUpDown, Check, Calculator, Tag } from "lucide-react";
import { useLocation } from "wouter";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatCurrency } from "@/lib/utils";
import { estimateFinalAmount } from "@/lib/early-payment-discount";

const loanSchema = z.object({
  name: z.string().min(1, "Borrower name is required"),
  transactionDate: z.string().min(1, "Transaction date is required"),
  principal: z.coerce.number().min(0.01, "Principal must be greater than 0"),
  tenureDays: z.coerce.number().int().min(1, "Tenure must be at least 1 day"),
  returnDate: z.string().optional(),
  whatsapp: z.string().optional(),
  discountOrChargesAbs: z.coerce.number().min(0).optional(),
  isDiscount: z.boolean().optional(),
  notes: z.string().optional(),
  status: z.enum(["Pending", "Clear", "Temp", "Archived"]).optional(),
});

type LoanFormValues = z.infer<typeof loanSchema>;

interface LoanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan?: Loan;
  defaultName?: string;
}

export default function LoanFormDialog({ open, onOpenChange, loan, defaultName }: LoanFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const isEditing = !!loan;
  const [namePopoverOpen, setNamePopoverOpen] = useState(false);
  const [nameSearch, setNameSearch] = useState("");

  // Derive unique borrower names from existing loans
  const { data: loans } = useListLoans(undefined, {
    query: { queryKey: getListLoansQueryKey(), enabled: open },
  });

  const uniqueNames: { name: string; phone: string }[] = (() => {
    const seen = new Set<string>();
    const result: { name: string; phone: string }[] = [];
    for (const l of loans ?? []) {
      const key = l.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        const phone = (l.whatsapp ?? "").split("\n")[0].trim();
        result.push({ name: l.name.trim(), phone });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  })();

  const getDefaults = (): LoanFormValues => {
    const existingDiscount = loan?.discountOrCharges ?? 0;
    return {
      name: loan?.name || defaultName || "",
      transactionDate: loan?.transactionDate || format(new Date(), "yyyy-MM-dd"),
      principal: loan?.principal ?? (undefined as unknown as number),
      tenureDays: loan?.tenureDays || 30,
      returnDate: loan?.returnDate || "",
      whatsapp: loan?.whatsapp || "",
      discountOrChargesAbs: existingDiscount !== 0 ? Math.abs(existingDiscount) : 0,
      isDiscount: existingDiscount < 0,
      notes: loan?.notes || "",
      status: loan?.status || "Pending",
    };
  };

  const form = useForm<LoanFormValues>({
    resolver: zodResolver(loanSchema),
    defaultValues: getDefaults(),
  });

  const createLoan = useCreateLoan();
  const updateLoan = useUpdateLoan();
  const isPending = createLoan.isPending || updateLoan.isPending;

  // Watch fields for cross-calculation
  const watchedTransactionDate = form.watch("transactionDate");
  const watchedTenureDays = form.watch("tenureDays");
  const watchedReturnDate = form.watch("returnDate");
  const watchedPrincipal = form.watch("principal");

  /**
   * Round repayment amount down to nearest:
   *  - multiple of 5   when repayment < 1000
   *  - multiple of 10  when repayment ≥ 1000
   * Discount = repayment − rounded (always applied to the final repayment value).
   */
  function floorRepaymentAmount(amount: number): number {
    if (amount < 1000) return Math.floor(amount / 5) * 5;
    return Math.floor(amount / 10) * 10;
  }

  // Auto-populate discount from rounding when principal or tenure changes (new loans only)
  useEffect(() => {
    if (isEditing) return;
    const amt = Number(watchedPrincipal);
    const t = Number(watchedTenureDays);
    if (!amt || amt <= 0 || !t || t <= 0) return;
    const { finalAmount } = estimateFinalAmount({ principal: amt, tenureDays: t });
    const rounded = floorRepaymentAmount(finalAmount);
    const diff = finalAmount - rounded;
    if (diff > 0) {
      form.setValue("discountOrChargesAbs", diff, { shouldDirty: false });
      form.setValue("isDiscount", true, { shouldDirty: false });
    } else {
      form.setValue("discountOrChargesAbs", 0, { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedPrincipal, watchedTenureDays]);

  // When tenureDays changes, update returnDate
  const handleTenureChange = (value: string) => {
    form.setValue("tenureDays", Number(value) || 1);
    const txDate = form.getValues("transactionDate");
    if (txDate && value && Number(value) > 0) {
      try {
        const computed = addDays(parseISO(txDate), Number(value));
        form.setValue("returnDate", format(computed, "yyyy-MM-dd"), { shouldDirty: false });
      } catch {}
    }
  };

  // When returnDate changes, update tenureDays
  const handleReturnDateChange = (value: string) => {
    form.setValue("returnDate", value);
    const txDate = form.getValues("transactionDate");
    if (txDate && value) {
      try {
        const diff = differenceInCalendarDays(parseISO(value), parseISO(txDate));
        if (diff > 0) {
          form.setValue("tenureDays", diff, { shouldDirty: false });
        }
      } catch {}
    }
  };

  // When transactionDate changes, keep returnDate consistent with tenure
  const handleTransactionDateChange = (value: string) => {
    form.setValue("transactionDate", value);
    const tenure = form.getValues("tenureDays");
    if (value && tenure && tenure > 0) {
      try {
        const computed = addDays(parseISO(value), tenure);
        form.setValue("returnDate", format(computed, "yyyy-MM-dd"), { shouldDirty: false });
      } catch {}
    }
  };

  function onSubmit(data: LoanFormValues) {
    const discountOrCharges = data.discountOrChargesAbs
      ? (data.isDiscount ? -Math.abs(data.discountOrChargesAbs) : Math.abs(data.discountOrChargesAbs))
      : 0;

    const submitData = {
      name: data.name,
      transactionDate: data.transactionDate,
      principal: data.principal,
      tenureDays: data.tenureDays,
      whatsapp: data.whatsapp,
      discountOrCharges,
      notes: data.notes,
      status: data.status,
    };

    if (isEditing) {
      updateLoan.mutate(
        { id: loan.id, data: submitData },
        {
          onSuccess: (updatedLoan) => {
            queryClient.setQueryData(getGetLoanQueryKey(loan.id), updatedLoan);
            queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
            toast({ title: "Loan updated", description: "The sheet has recalculated the computed fields." });
            onOpenChange(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Could not update loan." });
          },
        },
      );
    } else {
      createLoan.mutate(
        { data: submitData },
        {
          onSuccess: (newLoan) => {
            queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
            toast({ title: "Loan recorded", description: "Added to the Heat Map sheet." });
            form.reset();
            onOpenChange(false);
            setLocation(`/loans/${newLoan.id}`);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Could not create loan." });
          },
        },
      );
    }
  }

  useEffect(() => {
    if (open) {
      const defaults = getDefaults();
      // Compute returnDate from transactionDate + tenureDays if not set
      if (!defaults.returnDate && defaults.transactionDate && defaults.tenureDays) {
        try {
          defaults.returnDate = format(
            addDays(parseISO(defaults.transactionDate), defaults.tenureDays),
            "yyyy-MM-dd"
          );
        } catch {}
      }
      form.reset(defaults);
      setNameSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loan, defaultName]);

  const currentName = form.watch("name");
  const filteredNames = uniqueNames.filter((b) =>
    b.name.toLowerCase().includes(nameSearch.toLowerCase()),
  );

  const isDiscountChecked = form.watch("isDiscount");
  const watchedDiscountAbs = form.watch("discountOrChargesAbs");

  const calcPreview = useMemo(() => {
    const p = Number(watchedPrincipal);
    const t = Number(watchedTenureDays);
    if (!p || !t || p <= 0 || t <= 0) return null;
    const discountAbs = Number(watchedDiscountAbs ?? 0);
    // discount > 0 reduces final; charge (not discount) increases final
    const discountValue = isDiscountChecked ? discountAbs : -discountAbs;
    return estimateFinalAmount({ principal: p, tenureDays: t, discount: discountValue });
  }, [watchedPrincipal, watchedTenureDays, watchedDiscountAbs, isDiscountChecked]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Loan" : "Record Loan"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Only input fields are editable — computed fields (fees, interest, final amount) are recalculated by the sheet."
              : "This writes only the inputs to your Heat Map sheet. Fees, interest, and the final amount are computed automatically."}
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
                        <Command>
                          <CommandInput
                            placeholder="Search or type a new name…"
                            value={nameSearch}
                            onValueChange={(v) => {
                              setNameSearch(v);
                              field.onChange(v);
                            }}
                          />
                          {nameSearch && !uniqueNames.some(
                            (b) => b.name.toLowerCase() === nameSearch.toLowerCase(),
                          ) && (
                            <div className="px-3 py-2 text-xs text-muted-foreground border-b">
                              Press Enter or select below to add as new borrower
                            </div>
                          )}
                          <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
                            {nameSearch ? `Record as new borrower: "${nameSearch}"` : "No borrowers found."}
                          </CommandEmpty>
                          <div className="max-h-52 overflow-y-auto">
                            <CommandGroup>
                              {filteredNames.map((b) => (
                                <CommandItem
                                  key={b.name}
                                  value={b.name}
                                  onSelect={(val) => {
                                    field.onChange(val);
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
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </div>
                        </Command>
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
                      <Input type="number" step="0.01" min="0" placeholder="5000" {...field} value={field.value ?? ""} />
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

            {/* Transaction Date */}
            <FormField
              control={form.control}
              name="transactionDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transaction Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      onChange={(e) => handleTransactionDateChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tenure + Return Date — linked pair */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tenureDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenure (Days)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="30"
                        {...field}
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
                    <FormLabel>Return Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        onChange={(e) => handleReturnDateChange(e.target.value)}
                      />
                    </FormControl>
                    <FormDescription className="text-[10px]">Auto-calculated from tenure</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Discount / Charges with checkbox */}
            <div className="space-y-2">
              <FormLabel>Discount / Charges (₹)</FormLabel>
              <div className="flex items-center gap-3">
                <FormField
                  control={form.control}
                  name="discountOrChargesAbs"
                  render={({ field }) => (
                    <FormItem className="flex-1 space-y-0">
                      <FormControl>
                        <div className="relative">
                          {isDiscountChecked && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-emerald-600 font-medium pointer-events-none">−</span>
                          )}
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0"
                            className={isDiscountChecked ? "pl-6" : ""}
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isDiscount"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 shrink-0">
                      <FormControl>
                        <Checkbox
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal cursor-pointer flex items-center gap-1 mb-0">
                        <Tag className="h-3.5 w-3.5 text-emerald-600" />
                        Is Discount
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {isDiscountChecked
                  ? "Will be recorded as a negative value (discount reduces final amount)."
                  : "Positive value adds extra charges to the final amount."}
              </p>
            </div>

            {isEditing && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
            )}

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

            {!isEditing && calcPreview && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <Calculator className="h-4 w-4" /> Estimated Calculation
                </p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">Flat Fee</p>
                    <p className="font-semibold font-numeric">{formatCurrency(calcPreview.flatFee)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">Interest</p>
                    <p className="font-semibold font-numeric">{formatCurrency(calcPreview.interest)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">Final Amount</p>
                    <p className="font-bold font-numeric text-amber-900 dark:text-amber-200">{formatCurrency(calcPreview.finalAmount)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-500">Estimate only — sheet formulas are the source of truth.</p>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Record Loan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
