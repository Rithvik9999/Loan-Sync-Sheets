import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateRepayment, getListRepaymentsQueryKey, getGetLoanScheduleQueryKey, getGetLoanQueryKey } from "@workspace/api-client-react";
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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const repaymentSchema = z.object({
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  paidDate: z.string().min(1, "Date is required"),
  method: z.string().optional(),
  notes: z.string().optional(),
});

type RepaymentFormValues = z.infer<typeof repaymentSchema>;

interface RecordRepaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string;
  suggestedAmount?: number;
}

export default function RecordRepaymentDialog({ open, onOpenChange, loanId, suggestedAmount = 0 }: RecordRepaymentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<RepaymentFormValues>({
    resolver: zodResolver(repaymentSchema),
    defaultValues: {
      amount: suggestedAmount,
      paidDate: format(new Date(), 'yyyy-MM-dd'),
      method: "bank_transfer",
      notes: "",
    },
  });

  const createRepayment = useCreateRepayment();

  function onSubmit(data: RepaymentFormValues) {
    createRepayment.mutate(
      { 
        data: {
          loanId,
          amount: data.amount,
          paidDate: data.paidDate,
          method: data.method,
          notes: data.notes
        }
      },
      {
        onSuccess: () => {
          // Invalidate multiple queries
          queryClient.invalidateQueries({ queryKey: getListRepaymentsQueryKey({ loanId }) });
          queryClient.invalidateQueries({ queryKey: getGetLoanScheduleQueryKey(loanId) });
          queryClient.invalidateQueries({ queryKey: getGetLoanQueryKey(loanId) });
          // Note: we don't invalidate dashboard summary aggressively here to save requests, 
          // it has a 1min stale time anyway.
          
          toast({ title: "Repayment recorded", description: "The payment has been logged to the ledger." });
          form.reset();
          onOpenChange(false);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Could not record repayment." });
        }
      }
    );
  }

  // Update default amount when opened
  useEffect(() => {
    if (open) {
      form.reset({
        amount: suggestedAmount > 0 ? suggestedAmount : undefined,
        paidDate: format(new Date(), 'yyyy-MM-dd'),
        method: "bank_transfer",
        notes: "",
      });
    }
  }, [open, suggestedAmount, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Record Repayment</DialogTitle>
          <DialogDescription>
            Log a payment received for this loan.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount Received ($)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0.01" {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="paidDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date Received</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
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
                    <Textarea placeholder="Reference number or context..." className="resize-none h-20" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createRepayment.isPending} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                {createRepayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Log Payment
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
