import { useEffect, useState } from "react";
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
import { Loader2, MessageCircle, CheckCircle2 } from "lucide-react";

/** Digits only, strips a leading 91/+91 country code, capped at 10 digits. */
function sanitizePhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 10);
}

function buildWhatsAppLink(phone: string, name: string, pin: string): string {
  const message = `Hello ${name}! 👋\n\nYour BorrowApp login credentials:\n📱 Phone: ${phone}\n🔑 PIN: ${pin}\n\nUse these to check your loan details at openr3.in\n\nIf you need to change your pin, ask me.`;
  return `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
}

const borrowerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().length(10, "Phone number must be exactly 10 digits"),
  pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits").optional().or(z.literal("")),
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

  // Holds the last saved phone+pin so we can offer WhatsApp share after save
  const [savedCredentials, setSavedCredentials] = useState<{ name: string; phone: string; pin: string } | null>(null);

  const form = useForm<BorrowerFormValues>({
    resolver: zodResolver(borrowerSchema),
    defaultValues: {
      name: borrower?.name || defaultName || "",
      phone: sanitizePhoneInput(borrower?.phone || defaultPhone || ""),
      pin: "",
    },
  });

  const createBorrower = useCreateBorrower();
  const updateBorrower = useUpdateBorrower();
  const isPending = createBorrower.isPending || updateBorrower.isPending;

  // Watch pin for the live WhatsApp share button
  const watchPhone = form.watch("phone");
  const watchPin = form.watch("pin");
  const watchName = form.watch("name");
  const canShareNow = watchPhone.length === 10 && /^\d{6}$/.test(watchPin ?? "");

  function onSubmit(data: BorrowerFormValues) {
    const payload = {
      name: data.name,
      phone: data.phone,
      ...(data.pin ? { pin: data.pin } : {}),
    };

    if (isEditing) {
      updateBorrower.mutate(
        { id: borrower.id, data: payload },
        {
          onSuccess: (updatedBorrower) => {
            queryClient.setQueryData(getGetBorrowerQueryKey(borrower.id), updatedBorrower);
            queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
            if (data.pin) {
              setSavedCredentials({ name: data.name, phone: data.phone, pin: data.pin });
            } else {
              toast({ title: "Profile updated", description: "Changes saved." });
              onOpenChange(false);
            }
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
            if (data.pin) {
              setSavedCredentials({ name: data.name, phone: data.phone, pin: data.pin });
            } else {
              toast({ title: "Portal access enabled", description: `${data.name} can now log in.` });
              form.reset();
              onOpenChange(false);
            }
          },
          onError: () => {
            toast({ variant: "destructive", title: "Error", description: "Could not set up portal access." });
          },
        },
      );
    }
  }

  function handleClose() {
    setSavedCredentials(null);
    onOpenChange(false);
  }

  useEffect(() => {
    if (open) {
      setSavedCredentials(null);
      form.reset({
        name: borrower?.name || defaultName || "",
        phone: sanitizePhoneInput(borrower?.phone || defaultPhone || ""),
        pin: "",
      });
    }
  }, [open, borrower, defaultName, defaultPhone, form]);

  // --- Success state: show WhatsApp share option ---
  if (savedCredentials) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Access {isEditing ? "Updated" : "Enabled"}
            </DialogTitle>
            <DialogDescription>
              {savedCredentials.name}'s login credentials are saved. Share them via WhatsApp now.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/40 p-4 space-y-1 text-sm font-mono">
            <div><span className="text-muted-foreground">Phone: </span>{savedCredentials.phone}</div>
            <div><span className="text-muted-foreground">PIN:&nbsp;&nbsp; </span>{savedCredentials.pin}</div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} className="sm:mr-auto">
              Done
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              asChild
            >
              <a
                href={buildWhatsAppLink(savedCredentials.phone, savedCredentials.name, savedCredentials.pin)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleClose}
              >
                <MessageCircle className="h-4 w-4" />
                Share on WhatsApp
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Borrower" : "Set Up Portal Access"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this borrower's login phone and optionally set a new PIN."
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
                    <Input
                      placeholder="9876543210"
                      inputMode="numeric"
                      maxLength={10}
                      {...field}
                      onChange={(e) => field.onChange(sanitizePhoneInput(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>This is the borrower's 10-digit login identifier.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEditing ? "New PIN (leave blank to keep)" : "PIN"}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder={isEditing ? "Leave blank to keep existing" : "6-digit PIN"}
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </FormControl>
                  <FormDescription>
                    You set and share this PIN with the borrower — there's no self-service reset.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4 flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {canShareNow && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  asChild
                >
                  <a
                    href={buildWhatsAppLink(watchPhone, watchName, watchPin ?? "")}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Preview WhatsApp
                  </a>
                </Button>
              )}
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
