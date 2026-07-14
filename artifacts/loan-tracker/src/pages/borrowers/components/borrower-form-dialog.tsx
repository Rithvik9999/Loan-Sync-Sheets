import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateBorrower, useUpdateBorrower, getListBorrowersQueryKey, getGetBorrowerQueryKey, Borrower } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
import { Loader2 } from "lucide-react";

const borrowerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
});

type BorrowerFormValues = z.infer<typeof borrowerSchema>;

interface BorrowerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  borrower?: Borrower; // If provided, we're editing
}

export default function BorrowerFormDialog({ open, onOpenChange, borrower }: BorrowerFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!borrower;

  const form = useForm<BorrowerFormValues>({
    resolver: zodResolver(borrowerSchema),
    defaultValues: {
      name: borrower?.name || "",
      email: borrower?.email || "",
      phone: borrower?.phone || "",
    },
  });

  const createBorrower = useCreateBorrower();
  const updateBorrower = useUpdateBorrower();

  const isPending = createBorrower.isPending || updateBorrower.isPending;

  function onSubmit(data: BorrowerFormValues) {
    if (isEditing) {
      updateBorrower.mutate(
        { id: borrower.id, data },
        {
          onSuccess: (updatedBorrower) => {
            queryClient.setQueryData(getGetBorrowerQueryKey(borrower.id), updatedBorrower);
            queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
            toast({ title: "Borrower updated", description: "The profile has been saved." });
            onOpenChange(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Could not update borrower." });
          }
        }
      );
    } else {
      createBorrower.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
            toast({ title: "Borrower created", description: "The new borrower profile is ready." });
            form.reset();
            onOpenChange(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Could not create borrower." });
          }
        }
      );
    }
  }

  // Reset form when dialog opens with new data
  React.useEffect(() => {
    if (open) {
      form.reset({
        name: borrower?.name || "",
        email: borrower?.email || "",
        phone: borrower?.phone || "",
      });
    }
  }, [open, borrower, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Borrower" : "Add Borrower"}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Update contact information for this borrower." 
              : "Enter the details for the new borrower."}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Jane Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input placeholder="jane@example.com" type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="+1 (555) 000-0000" {...field} />
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
                {isEditing ? "Save Changes" : "Create Borrower"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
