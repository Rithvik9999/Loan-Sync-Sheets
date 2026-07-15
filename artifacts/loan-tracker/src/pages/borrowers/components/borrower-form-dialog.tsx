import { useEffect } from "react";
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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const borrowerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone number is required"),
  password: z.string().min(4, "Password must be at least 4 characters").optional().or(z.literal("")),
});

type BorrowerFormValues = z.infer<typeof borrowerSchema>;

interface BorrowerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  borrower?: Borrower;
  defaultName?: string;
  defaultPhone?: string;
}

export default function BorrowerFormDialog({ open, onOpenChange, borrower, defaultName, defaultPhone }: BorrowerFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!borrower;

  const form = useForm<BorrowerFormValues>({
    resolver: zodResolver(borrowerSchema),
    defaultValues: {
      name: borrower?.name || defaultName || "",
      phone: borrower?.phone || defaultPhone || "",
      password: "",
    },
  });

  const createBorrower = useCreateBorrower();
  const updateBorrower = useUpdateBorrower();
  const isPending = createBorrower.isPending || updateBorrower.isPending;

  function onSubmit(data: BorrowerFormValues) {
    const payload = {
      name: data.name,
      phone: data.phone,
      ...(data.password ? { password: data.password } : {}),
    };

    if (isEditing) {
      updateBorrower.mutate(
        { id: borrower.id, data: payload },
        {
          onSuccess: (updatedBorrower) => {
            queryClient.setQueryData(getGetBorrowerQueryKey(borrower.id), updatedBorrower);
            queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
            toast({ title: "Profile updated", description: "Changes saved." });
            onOpenChange(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Could not update borrower." });
          },
        },
      );
    } else {
      createBorrower.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
            toast({ title: "Portal access enabled", description: `${data.name} can now log in with their phone number.` });
            form.reset();
            onOpenChange(false);
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Could not set up portal access." });
          },
        },
      );
    }
  }

  useEffect(() => {
    if (open) {
      form.reset({
        name: borrower?.name || defaultName || "",
        phone: borrower?.phone || defaultPhone || "",
        password: "",
      });
    }
  }, [open, borrower, defaultName, defaultPhone, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Borrower" : "Set Up Portal Access"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this borrower's login phone and optionally change their password."
              : "Give this borrower a login so they can check their own loans."}
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
                    <Input
                      placeholder="Name as it appears in loans"
                      {...field}
                      readOnly={!!defaultName && !isEditing}
                      className={defaultName && !isEditing ? "bg-muted" : ""}
                    />
                  </FormControl>
                  <FormDescription>Must match the name used in the Heat Map sheet.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number (Login ID)</FormLabel>
                  <FormControl>
                    <Input placeholder="9876543210" {...field} />
                  </FormControl>
                  <FormDescription>This is the borrower's login identifier.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEditing ? "New Password (leave blank to keep)" : "Password"}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={isEditing ? "Leave blank to keep existing" : "Min 4 characters"}
                      {...field}
                    />
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
                {isEditing ? "Save Changes" : "Enable Access"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
