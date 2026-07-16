import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useUpdateLoan,
  getListLoansQueryKey,
  getGetLoanQueryKey,
  Loan,
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
import { Loader2 } from "lucide-react";

const paymentSchema = z.object({
  paid: z.coerce.number().min(0, "Amount cannot be negative"),
  status: z.enum(["Pending", "Clear", "Temp", "Archived"]),
  partPayment: z.coerce.number().optional(),
  dateOfPartPayment: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
}

export default function RecordPaymentDialog({ open, onOpenChange, loan }: RecordPaymentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const defaults = (): PaymentFormValues => ({
    // When marking as Clear, default paid to finalAmount so admin can confirm or adjust
    paid: loan.paid ?? (loan.finalAmount ?? 0),
    status: loan.status,
    partPayment: loan.partPayment ?? undefined,
    dateOfPartPayment: loan.dateOfPartPayment ?? undefined,
  });

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: defaults(),
  });

  const updateLoan = useUpdateLoan();

  function onSubmit(data: PaymentFormValues) {
    updateLoan.mutate(
      { id: loan.id, data },
      {
        onSuccess: (updatedLoan) => {
          queryClient.setQueryData(getGetLoanQueryKey(loan.id), updatedLoan);
          queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
          toast({ title: "Payment recorded", description: "The sheet has recalculated the final amount and profit." });
          onOpenChange(false);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Could not record payment." });
        },
      },
    );
  }

  useEffect(() => {
    if (open) {
      form.reset(defaults());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loan, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Update the amount collected for this loan. The sheet recomputes profit automatically.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="paid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Amount Collected</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} autoFocus />
                  </FormControl>
                  <FormDescription>The running total collected so far, not a single installment.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="partPayment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Part Payment (Optional)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dateOfPartPayment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Part Payment Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? format(new Date(), "yyyy-MM-dd")} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                  <FormDescription>Mark as Clear once the loan is fully settled.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateLoan.isPending} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                {updateLoan.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Payment
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
