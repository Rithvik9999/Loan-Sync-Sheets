import { useState } from "react";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppAuth } from "@/hooks/use-app-auth";
import {
  useListLoans,
  useCreateLoanRequest,
  getListLoansQueryKey,
  getListLoanRequestsQueryKey,
  Loan,
} from "@workspace/api-client-react";
import { useListLoanRequests } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { LoanStatusBadge } from "@/components/status-badges";
import { EmptyState } from "@/components/empty-state";
import {
  CreditCard,
  ChevronRight,
  Plus,
  Banknote,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// ─── Loan Request Dialog ──────────────────────────────────────────────────────

const loanRequestSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Enter a valid amount" })
    .positive("Amount must be greater than 0"),
  tenureDays: z.coerce
    .number({ invalid_type_error: "Enter a valid tenure" })
    .int()
    .positive("Tenure must be at least 1 day"),
  purpose: z.string().optional(),
});

type LoanRequestValues = z.infer<typeof loanRequestSchema>;

function LoanRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createLoanRequest = useCreateLoanRequest();

  const form = useForm<LoanRequestValues>({
    resolver: zodResolver(loanRequestSchema),
    defaultValues: { amount: undefined, tenureDays: undefined, purpose: "" },
  });

  function onSubmit(data: LoanRequestValues) {
    createLoanRequest.mutate(
      { data: { amount: data.amount, tenureDays: data.tenureDays, purpose: data.purpose || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLoanRequestsQueryKey() });
          toast({
            title: "Request submitted",
            description: "Your loan request has been sent to the admin.",
          });
          form.reset();
          onOpenChange(false);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Could not submit request." });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Request a New Loan</DialogTitle>
          <DialogDescription>
            Fill in the details and the admin will review your request.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Amount (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g. 50000"
                      min="1"
                      step="1"
                      {...field}
                      value={field.value ?? ""}
                    />
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
                  <FormLabel>Tenure (days)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g. 30"
                      min="1"
                      step="1"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose (optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Brief reason for the loan…" rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createLoanRequest.isPending}>
                {createLoanRequest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── UPI Repay Dialog ─────────────────────────────────────────────────────────

const UPI_VPA = "9438556400@slc";

function openUpi(amount: number) {
  const note = encodeURIComponent("Loan Repayment");
  const link = `upi://pay?pa=${UPI_VPA}&am=${amount.toFixed(2)}&cu=INR&tn=${note}`;
  window.location.href = link;
}

function RepayDialog({
  open,
  onOpenChange,
  loan,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loan: Loan;
}) {
  const outstanding = (loan.finalAmount ?? 0) - (loan.paid ?? 0);
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [custom, setCustom] = useState("");

  const amount = mode === "full" ? Math.max(outstanding, 0) : Number(custom);
  const isValid = amount > 0 && Number.isFinite(amount);

  const handlePay = () => {
    openUpi(amount);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Repay Loan</DialogTitle>
          <DialogDescription>
            This will open your UPI app to pay <strong>{UPI_VPA}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Final amount</span>
              <span className="font-semibold font-numeric">{formatCurrency(loan.finalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid so far</span>
              <span className="font-semibold font-numeric text-emerald-700">{formatCurrency(loan.paid ?? 0)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 mt-1">
              <span className="text-muted-foreground font-medium">Outstanding</span>
              <span className="font-bold font-numeric text-destructive">{formatCurrency(Math.max(outstanding, 0))}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("full")}
              className={`rounded-lg border p-3 text-sm font-medium transition-colors text-left ${
                mode === "full"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-semibold">Full amount</div>
              <div className="text-muted-foreground font-numeric text-xs mt-0.5">
                {formatCurrency(Math.max(outstanding, 0))}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`rounded-lg border p-3 text-sm font-medium transition-colors text-left ${
                mode === "custom"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-semibold">Custom amount</div>
              <div className="text-muted-foreground text-xs mt-0.5">Enter any amount</div>
            </button>
          </div>

          {mode === "custom" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount (₹)</label>
              <Input
                type="number"
                placeholder="Enter amount"
                min="1"
                step="1"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {isValid && (
            <p className="text-sm text-center text-muted-foreground">
              You will pay <span className="font-semibold text-foreground">{formatCurrency(amount)}</span> to {UPI_VPA}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePay}
            disabled={!isValid}
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            <Banknote className="mr-2 h-4 w-4" />
            Pay via UPI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Loan Card ────────────────────────────────────────────────────────────────

function LoanCard({ loan }: { loan: Loan }) {
  const [repayOpen, setRepayOpen] = useState(false);
  const outstanding = (loan.finalAmount ?? 0) - (loan.paid ?? 0);

  return (
    <>
      <Card className="overflow-hidden shadow-sm border-border/60">
        <div className="bg-primary/5 px-6 py-4 border-b flex justify-between items-center gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-medium font-serif flex items-center gap-3">
              {formatCurrency(loan.principal)} Loan
              <LoanStatusBadge status={loan.status} />
            </h2>
            <p className="text-sm text-muted-foreground">
              Taken {formatDate(loan.transactionDate)} · {loan.tenureDays} days
            </p>
          </div>
          <div className="flex gap-2">
            {loan.status !== "Clear" && (
              <Button
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={() => setRepayOpen(true)}
              >
                <Banknote className="mr-1.5 h-3.5 w-3.5" />
                Repay
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/loans/${loan.id}`}>
                Details <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <CardContent className="p-0">
          <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
            <div className="p-5 space-y-1">
              <div className="text-xs text-muted-foreground">Total Due</div>
              <div className="text-2xl font-bold font-numeric text-foreground">
                {loan.finalAmount != null ? formatCurrency(loan.finalAmount) : "—"}
              </div>
            </div>
            <div className="p-5 bg-muted/10 space-y-1">
              <div className="text-xs text-muted-foreground">Paid So Far</div>
              <div className="text-xl font-semibold font-numeric text-emerald-700">
                {formatCurrency(loan.paid ?? 0)}
              </div>
            </div>
            <div className="p-5 space-y-1">
              <div className="text-xs text-muted-foreground">
                {loan.status === "Clear" ? "Return Date" : "Outstanding"}
              </div>
              {loan.status === "Clear" ? (
                <div className="text-xl font-semibold font-numeric">
                  {loan.returnDate ? formatDate(loan.returnDate) : "—"}
                </div>
              ) : (
                <div className={`text-xl font-semibold font-numeric ${outstanding > 0 ? "text-destructive" : "text-emerald-700"}`}>
                  {formatCurrency(Math.max(outstanding, 0))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <RepayDialog open={repayOpen} onOpenChange={setRepayOpen} loan={loan} />
    </>
  );
}

// ─── Loan Requests Section ────────────────────────────────────────────────────

const requestStatusIcon = {
  Pending: <Clock className="h-4 w-4 text-amber-500" />,
  Approved: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  Rejected: <XCircle className="h-4 w-4 text-destructive" />,
};

function MyLoanRequests() {
  const { data: requests, isLoading } = useListLoanRequests({
    query: { queryKey: getListLoanRequestsQueryKey() },
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!requests || requests.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold font-serif">My Loan Requests</h2>
      <div className="space-y-2">
        {requests.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm"
          >
            <div className="flex items-center gap-3">
              {requestStatusIcon[r.status]}
              <div>
                <span className="font-semibold font-numeric">{formatCurrency(r.amount)}</span>
                <span className="text-muted-foreground ml-2">· {r.tenureDays} days</span>
                {r.purpose && (
                  <p className="text-xs text-muted-foreground mt-0.5">{r.purpose}</p>
                )}
              </div>
            </div>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                r.status === "Pending"
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : r.status === "Approved"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Portal Page ──────────────────────────────────────────────────────────────

export default function Portal() {
  const { isLoaded, role, name } = useAppAuth();
  const [requestOpen, setRequestOpen] = useState(false);

  const { data: loans, isLoading: isLoadingLoans } = useListLoans(undefined, {
    query: {
      enabled: isLoaded && role === "borrower",
      queryKey: getListLoansQueryKey(),
    },
  });

  if (isLoadingLoans) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">
            {name ? `Hi, ${name}` : "My Loans"}
          </h1>
          <p className="text-muted-foreground mt-1">Your active and past loans.</p>
        </div>
        <Button onClick={() => setRequestOpen(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Request New Loan
        </Button>
      </div>

      {!loans || loans.length === 0 ? (
        <div className="py-12">
          <EmptyState
            title="No loans yet"
            description="You don't have any loans on record. Request one to get started."
            icon={<CreditCard />}
            action={
              <Button onClick={() => setRequestOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Request a Loan
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4">
          {loans.map((loan) => (
            <LoanCard key={loan.id} loan={loan} />
          ))}
        </div>
      )}

      <MyLoanRequests />

      <LoanRequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
    </div>
  );
}
