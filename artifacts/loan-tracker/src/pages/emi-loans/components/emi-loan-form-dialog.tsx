import { useEffect, useState } from "react";
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
import { Loader2, ChevronsUpDown, Check } from "lucide-react";
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
import { cn } from "@/lib/utils";

export interface EmiLoan {
  id: string;
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
  status: "Pending" | "Clear" | "Temp";
  whatsapp: string;
  lateFees: number | null;
  remainingMonths: number | null;
  notes: string;
  borrowerId?: string | null;
}

const emiLoanSchema = z.object({
  name: z.string().min(1, "Borrower name is required"),
  transactionDate: z.string().min(1, "Transaction date is required"),
  principal: z.coerce.number().min(0.01, "Principal must be greater than 0"),
  tenureMonths: z.coerce.number().int().min(1, "Tenure must be at least 1 month"),
  whatsapp: z.string().optional(),
  discountPerMonth: z.coerce.number().optional(),
  statusNotes: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["Pending", "Clear", "Temp"]).optional(),
});

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

async function createEmiLoan(data: EmiLoanFormValues): Promise<EmiLoan> {
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
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create EMI loan" }));
    throw new Error(err.error || "Failed to create EMI loan");
  }
  return res.json();
}

async function updateEmiLoan(id: string, data: Partial<EmiLoanFormValues>): Promise<EmiLoan> {
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
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to update EMI loan" }));
    throw new Error(err.error || "Failed to update EMI loan");
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
  });

  const form = useForm<EmiLoanFormValues>({
    resolver: zodResolver(emiLoanSchema),
    defaultValues: defaults(),
  });

  async function onSubmit(data: EmiLoanFormValues) {
    setIsPending(true);
    try {
      if (isEditing) {
        const updated = await updateEmiLoan(loan.id, data);
        queryClient.setQueryData(emiLoanQueryKey(loan.id), updated);
        queryClient.invalidateQueries({ queryKey: EMI_LOANS_QUERY_KEY });
        toast({ title: "EMI Loan updated", description: "The sheet has recalculated the computed fields." });
        onOpenChange(false);
      } else {
        const newLoan = await createEmiLoan(data);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                name="tenureMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenure (Months)</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="1" placeholder="12" {...field} />
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
