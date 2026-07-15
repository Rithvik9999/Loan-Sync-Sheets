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
import { format } from "date-fns";

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
import { Loader2, ChevronsUpDown, Check, Calculator } from "lucide-react";
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
import { cn, formatCurrency } from "@/lib/utils";
import { estimateFinalAmount } from "@/lib/early-payment-discount";

const loanSchema = z.object({
  name: z.string().min(1, "Borrower name is required"),
  transactionDate: z.string().min(1, "Transaction date is required"),
  principal: z.coerce.number().min(0.01, "Principal must be greater than 0"),
  tenureDays: z.coerce.number().int().min(1, "Tenure must be at least 1 day"),
  whatsapp: z.string().optional(),
  discountOrCharges: z.coerce.number().optional(),
  notes: z.string().optional(),
  status: z.enum(["Pending", "Clear", "Temp"]).optional(),
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

  const borrowerNames: { name: string; phone: string }[] = (() => {
    const map = new Map<string, string>();
    for (const l of loans ?? []) {
      const key = l.name.trim().toLowerCase();
      if (!map.has(key)) {
        const phone = (l.whatsapp ?? "").split("\n")[0].trim();
        map.set(key, phone);
      }
    }
    return Array.from(map.entries())
      .map(([, phone], i) => ({
        name: Array.from(map.keys())[i]
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        phone,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  // Re-derive to get properly-cased names from original loan data
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

  const defaults = (): LoanFormValues => ({
    name: loan?.name || defaultName || "",
    transactionDate: loan?.transactionDate || format(new Date(), "yyyy-MM-dd"),
    principal: loan?.principal || 0,
    tenureDays: loan?.tenureDays || 30,
    whatsapp: loan?.whatsapp || "",
    discountOrCharges: loan?.discountOrCharges || 0,
    notes: loan?.notes || "",
    status: loan?.status || "Pending",
  });

  const form = useForm<LoanFormValues>({
    resolver: zodResolver(loanSchema),
    defaultValues: defaults(),
  });

  const createLoan = useCreateLoan();
  const updateLoan = useUpdateLoan();
  const isPending = createLoan.isPending || updateLoan.isPending;

  function onSubmit(data: LoanFormValues) {
    if (isEditing) {
      updateLoan.mutate(
        { id: loan.id, data },
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
        { data },
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
      form.reset(defaults());
      setNameSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loan, defaultName]);

  const currentName = form.watch("name");
  const filteredNames = uniqueNames.filter((b) =>
    b.name.toLowerCase().includes(nameSearch.toLowerCase()),
  );

  const watchedPrincipal = form.watch("principal");
  const watchedTenure = form.watch("tenureDays");
  const calcPreview = useMemo(() => {
    const p = Number(watchedPrincipal);
    const t = Number(watchedTenure);
    if (!p || !t || p <= 0 || t <= 0) return null;
    return estimateFinalAmount({ principal: p, tenureDays: t });
  }, [watchedPrincipal, watchedTenure]);

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
                          <CommandGroup className="max-h-52 overflow-y-auto">
                            {filteredNames.map((b) => (
                              <CommandItem
                                key={b.name}
                                value={b.name}
                                onSelect={(val) => {
                                  field.onChange(val);
                                  // Also auto-fill whatsapp if empty
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
                      <Input type="number" step="0.01" min="0" placeholder="5000" {...field} />
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
                    <FormLabel>Tenure (Days)</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="1" placeholder="30" {...field} />
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
              name="discountOrCharges"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount / Charges (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0" {...field} />
                  </FormControl>
                  <FormDescription>Negative for a discount, positive for an extra charge.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
