import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateLoan,
  useUpdateLoan,
  getListLoansQueryKey,
  getGetLoanQueryKey,
  Loan,
  useListBorrowers,
  getListBorrowersQueryKey,
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
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";

const loanSchema = z.object({
  name: z.string().min(1, "Borrower name is required"),
  transactionDate: z.string().min(1, "Transaction date is required"),
  principal: z.coerce.number().min(0.01, "Principal must be greater than 0"),
  tenureDays: z.coerce.number().int().min(1, "Tenure must be at least 1 day"),
  whatsapp: z.string().optional(),
  discountOrCharges: z.coerce.number().optional(),
  notes: z.string().optional(),
  status: z.enum(["Pending", "Clear", "Temp"]).optional(), // only used for edit
});

type LoanFormValues = z.infer<typeof loanSchema>;

interface LoanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan?: Loan; // If provided, we're editing
  defaultName?: string; // Pre-fill borrower name if creating from a borrower profile
}

export default function LoanFormDialog({ open, onOpenChange, loan, defaultName }: LoanFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const isEditing = !!loan;

  const { data: borrowers } = useListBorrowers({
    query: { queryKey: getListBorrowersQueryKey(), enabled: open },
  });

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
            toast({ title: "Loan recorded", description: "Added to the Heat Map sheet; computed fields are ready." });
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

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      form.reset(defaults());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loan, defaultName, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Loan" : "Record Loan"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Only these input fields are editable — fees, interest, late fees, and the final amount are computed automatically by the sheet."
              : "This writes only the inputs to your Heat Map sheet. Fees, interest, and the final amount are computed there automatically."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Borrower Name</FormLabel>
                  <FormControl>
                    <>
                      <Input placeholder="Jane Doe" list="borrower-names" {...field} />
                      <datalist id="borrower-names">
                        {borrowers?.map((b) => (
                          <option key={b.id} value={b.name} />
                        ))}
                      </datalist>
                    </>
                  </FormControl>
                  <FormDescription>Must match a borrower's name exactly for portal access to work.</FormDescription>
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
                    <FormLabel>Principal</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="5000.00" {...field} />
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
                    <FormLabel>WhatsApp / Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 555 000 0000" {...field} />
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
                  <FormLabel>Discount / Charges</FormLabel>
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
                    <Textarea placeholder="Any specific terms or context..." className="resize-none" {...field} />
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
                {isEditing ? "Save Changes" : "Record Loan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
