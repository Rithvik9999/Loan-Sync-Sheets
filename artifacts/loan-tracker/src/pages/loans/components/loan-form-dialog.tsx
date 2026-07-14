import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateLoan, useUpdateLoan, getListLoansQueryKey, getGetLoanQueryKey, Loan, useListBorrowers, getListBorrowersQueryKey } from "@workspace/api-client-react";
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
  borrowerId: z.string().min(1, "Please select a borrower"),
  principal: z.coerce.number().min(0.01, "Principal must be greater than 0"),
  interestRate: z.coerce.number().min(0, "Interest rate cannot be negative"),
  termMonths: z.coerce.number().int().min(1, "Term must be at least 1 month"),
  startDate: z.string().min(1, "Start date is required"),
  notes: z.string().optional(),
  status: z.enum(["active", "paid", "overdue", "defaulted"]).optional(), // only used for edit
});

type LoanFormValues = z.infer<typeof loanSchema>;

interface LoanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan?: Loan; // If provided, we're editing
  defaultBorrowerId?: string; // Pre-select if creating from borrower profile
}

export default function LoanFormDialog({ open, onOpenChange, loan, defaultBorrowerId }: LoanFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const isEditing = !!loan;

  const { data: borrowers, isLoading: isLoadingBorrowers } = useListBorrowers({
    query: { queryKey: getListBorrowersQueryKey(), enabled: open }
  });

  const form = useForm<LoanFormValues>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      borrowerId: loan?.borrowerId || defaultBorrowerId || "",
      principal: loan?.principal || 0,
      interestRate: loan?.interestRate || 5.0,
      termMonths: loan?.termMonths || 12,
      startDate: loan?.startDate ? loan.startDate.split('T')[0] : format(new Date(), 'yyyy-MM-dd'),
      notes: loan?.notes || "",
      status: loan?.status || "active",
    },
  });

  const createLoan = useCreateLoan();
  const updateLoan = useUpdateLoan();

  const isPending = createLoan.isPending || updateLoan.isPending;

  function onSubmit(data: LoanFormValues) {
    if (isEditing) {
      // Edit mode: can update certain fields including status
      const updateData = {
        principal: data.principal,
        interestRate: data.interestRate,
        termMonths: data.termMonths,
        startDate: data.startDate,
        status: data.status,
        notes: data.notes
      };
      
      updateLoan.mutate(
        { id: loan.id, data: updateData },
        {
          onSuccess: (updatedLoan) => {
            // Update local cache
            queryClient.setQueryData(getGetLoanQueryKey(loan.id), updatedLoan);
            queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
            queryClient.invalidateQueries({ queryKey: ["/api/loans", loan.id, "schedule"] }); // Invalidate schedule
            toast({ title: "Loan updated", description: "The loan details have been saved." });
            onOpenChange(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Could not update loan." });
          }
        }
      );
    } else {
      // Create mode
      const createData = {
        borrowerId: data.borrowerId,
        principal: data.principal,
        interestRate: data.interestRate,
        termMonths: data.termMonths,
        startDate: data.startDate,
        notes: data.notes
      };

      createLoan.mutate(
        { data: createData },
        {
          onSuccess: (newLoan) => {
            queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
            toast({ title: "Loan Originated", description: "The new loan agreement is ready." });
            form.reset();
            onOpenChange(false);
            setLocation(`/loans/${newLoan.id}`);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Could not create loan." });
          }
        }
      );
    }
  }

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      form.reset({
        borrowerId: loan?.borrowerId || defaultBorrowerId || "",
        principal: loan?.principal || 0,
        interestRate: loan?.interestRate || 5.0,
        termMonths: loan?.termMonths || 12,
        startDate: loan?.startDate ? loan.startDate.split('T')[0] : format(new Date(), 'yyyy-MM-dd'),
        notes: loan?.notes || "",
        status: loan?.status || "active",
      });
    }
  }, [open, loan, defaultBorrowerId, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Loan Agreement" : "Originate Loan"}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Modify the terms of this loan. This will recalculate the schedule." 
              : "Set up a new lending agreement. The repayment schedule will be computed automatically."}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            {!isEditing && (
              <FormField
                control={form.control}
                name="borrowerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Borrower</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoadingBorrowers || !!defaultBorrowerId}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a borrower" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {borrowers?.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="principal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Principal Amount ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="5000.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="interestRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Rate (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="5.0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="termMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Term (Months)</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="1" placeholder="12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isEditing && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paid">Paid in full</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                        <SelectItem value="defaulted">Defaulted</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>Manually override the status if needed.</FormDescription>
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
                {isEditing ? "Save Changes" : "Originate Loan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
