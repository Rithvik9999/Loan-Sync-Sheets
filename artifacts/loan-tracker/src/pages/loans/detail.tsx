import { useParams } from "wouter";
import { useState } from "react";
import {
  useGetLoan,
  useDeleteLoan,
  useUpdateLoan,
  getGetLoanQueryKey,
  getListLoansQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAppAuth } from "@/hooks/use-app-auth";
import { AlertTriangle } from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import { ArrowLeft, Edit, Trash2, Calendar, FileText, Plus, TrendingUp, CalendarDays, CalendarRange, Loader2, RotateCcw, Pencil, Share2, Clock } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { LoanStatusBadge } from "@/components/status-badges";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import LoanFormDialog from "./components/loan-form-dialog";
import RecordPaymentDialog from "./components/record-payment-dialog";

// ─── WhatsApp Share Helpers ──────────────────────────────────────────────────

const ADMIN_WA = "8917656405";

function sanitizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const stripped = digits.length > 10 && digits.startsWith("91") ? digits.slice(2) : digits;
  return stripped.slice(-10);
}

function openWaLink(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role } = useAppAuth();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteStep1Open, setIsDeleteStep1Open] = useState(false);
  const [isDeleteStep2Open, setIsDeleteStep2Open] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isEditPaid, setIsEditPaid] = useState(false);
  const [paidEditValue, setPaidEditValue] = useState("");
  const [quickPayDate, setQuickPayDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dailyPending, setDailyPending] = useState(false);
  const [weeklyPending, setWeeklyPending] = useState(false);
  const [undoPending, setUndoPending] = useState(false);

  const { data: loan, isLoading: isLoanLoading } = useGetLoan(id, {
    query: { queryKey: getGetLoanQueryKey(id), enabled: !!id },
  });

  const deleteLoan = useDeleteLoan();
  const updateLoan = useUpdateLoan();
  const isStaff = role === "staff";

  const handleDelete = () => {
    deleteLoan.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
          toast({ title: "Loan deleted", description: "The row has been removed from the sheet." });
          setLocation("/loans");
        },
        onError: () => {
          toast({ variant: "destructive", title: "Cannot delete", description: "An error occurred." });
          setIsDeleteStep2Open(false);
        },
      },
    );
  };

  if (isLoanLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!loan) {
    return <div className="py-12 text-center">Loan not found.</div>;
  }

  const stats: { label: string; value: string; muted?: boolean }[] = [
    { label: "Loan ID", value: loan.loanId },
    { label: "Principal", value: formatCurrency(loan.principal) },
    { label: "Tenure", value: `${loan.tenureDays} days` },
    { label: "Transaction Date", value: formatDate(loan.transactionDate) },
    { label: "Return Date", value: loan.returnDate ? formatDate(loan.returnDate) : "—" },
  ];

  const isOverdue = (loan.lateDays ?? 0) > 0 && loan.status !== "Clear";

  const handleShare = () => {
    const outstanding = Math.max((loan.finalAmount ?? 0) - (loan.paid ?? 0), 0);
    const lines = [
      `📋 Loan Summary`,
      `👤 Name: ${loan.name}`,
      `🔖 Loan ID: ${loan.loanId}`,
      `💰 Principal: ${formatCurrency(loan.principal)}`,
      ...(loan.transactionDate ? [`📅 Transaction Date: ${formatDate(loan.transactionDate)}`] : []),
      ...(loan.returnDate ? [`📆 Return Date: ${formatDate(loan.returnDate)}`] : []),
      `💵 Amount to Collect: ${loan.finalAmount != null ? formatCurrency(loan.finalAmount) : "—"}`,
      `✅ Collected: ${formatCurrency(loan.paid ?? 0)}`,
      ...(outstanding > 0 ? [`🔴 Outstanding: ${formatCurrency(outstanding)}`] : []),
      `📊 Status: ${loan.status}`,
      ...(isOverdue && (loan.lateDays ?? 0) > 0 ? [`⚠️ Late by: ${loan.lateDays} days`] : []),
    ];
    const msg = lines.join("\n");
    let phone: string;
    if (isStaff) {
      const raw = (loan.whatsapp ?? "").split("\n")[0].trim();
      const digits = sanitizePhoneNumber(raw);
      phone = digits.length === 10 ? `91${digits}` : ADMIN_WA;
    } else {
      phone = ADMIN_WA;
    }
    openWaLink(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`);
  };

  // Compute perDayAddition locally as a fallback in case the API field is absent
  const perDayAddition: number | null =
    (loan as any).perDayAddition ??
    (isOverdue && (loan.lateDays ?? 0) > 0 && (loan.lateFees ?? 0) > 0
      ? Math.round((loan.lateFees ?? 0) / (loan.lateDays ?? 1))
      : null);

  const computed: { label: string; value: string; highlight?: "red" | "amber" }[] = [
    { label: "Flat Fee", value: loan.flatFee != null ? formatCurrency(loan.flatFee) : "—" },
    { label: "Interest %", value: loan.interestPct != null ? `${Number((loan.interestPct * 100).toFixed(2))}%` : "—" },
    { label: "Interest", value: loan.interest != null ? formatCurrency(loan.interest) : "—" },
    { label: "Late Days", value: loan.lateDays != null ? String(loan.lateDays) : "—", highlight: isOverdue ? "red" : undefined },
    { label: "Late Fees", value: loan.lateFees != null ? formatCurrency(loan.lateFees) : "—", highlight: isOverdue ? "red" : undefined },
    ...(isOverdue && perDayAddition != null
      ? [{ label: "Per Day Addition", value: formatCurrency(perDayAddition), highlight: "amber" as const }]
      : []),
    ...(isStaff
      ? [
          { label: "Profit", value: loan.profit != null ? formatCurrency(loan.profit) : "—" },
          {
            label: "Discount / Charges",
            value: loan.discountOrCharges
              ? (loan.discountOrCharges < 0
                  ? `−${formatCurrency(Math.abs(loan.discountOrCharges))} (discount)`
                  : `+${formatCurrency(loan.discountOrCharges)} (charge)`)
              : "—"
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">
                {loan.name}
              </h1>
              <LoanStatusBadge status={loan.status} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-2" /> Share
          </Button>
          {isStaff && (
            <>
              <Button variant="outline" onClick={() => setIsEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" /> Edit
              </Button>
              <Button variant="destructive" onClick={() => setIsDeleteStep1Open(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Loan Details</CardTitle>
            <CardDescription>Inputs recorded directly on your Heat Map sheet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((s) => (
                <div key={s.label} className="space-y-1 border-r border-border/50 last:border-r-0">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-semibold font-numeric">{s.value}</p>
                </div>
              ))}
            </div>

            {loan.whatsapp && (
              <div className="pt-4 border-t border-border/50 text-sm">
                <span className="text-muted-foreground">WhatsApp / Phone: </span>
                <span className="font-medium">{loan.whatsapp}</span>
              </div>
            )}

            {loan.notes && (
              <div className="pt-4 border-t border-border/50">
                <p className="text-sm font-medium flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-muted-foreground" /> Notes
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{loan.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-1 shadow-sm border-border/60 bg-primary/5">
          <CardHeader>
            <CardTitle>Final Amount</CardTitle>
            <CardDescription>Computed by the sheet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Amount to Collect</p>
              <p className="text-3xl font-bold font-numeric text-foreground">
                {loan.finalAmount != null ? formatCurrency(loan.finalAmount) : "—"}
              </p>
            </div>

            <div className="space-y-1 pt-4 border-t border-primary/10">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Collected So Far</p>
                {isStaff && !isEditPaid && (
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit collected amount"
                    onClick={() => { setIsEditPaid(true); setPaidEditValue(String(loan.paid ?? 0)); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {isStaff && isEditPaid ? (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm font-numeric shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={paidEditValue}
                    onChange={(e) => setPaidEditValue(e.target.value)}
                    autoFocus
                  />
                  <button
                    className="shrink-0 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                    disabled={updateLoan.isPending}
                    onClick={() => {
                      const newPaid = parseFloat(paidEditValue);
                      if (isNaN(newPaid) || newPaid < 0) return;
                      updateLoan.mutate(
                        { id, data: { paid: newPaid } },
                        {
                          onSuccess: (updated) => {
                            queryClient.setQueryData(getGetLoanQueryKey(id), updated);
                            queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
                            toast({ title: "Updated", description: `Collected set to ${formatCurrency(newPaid)}.` });
                            setIsEditPaid(false);
                          },
                          onError: () => toast({ variant: "destructive", title: "Error", description: "Could not update." }),
                        }
                      );
                    }}
                  >
                    {updateLoan.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                  </button>
                  <button
                    className="shrink-0 h-8 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setIsEditPaid(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="text-xl font-semibold font-numeric text-emerald-700 dark:text-emerald-500">
                  {formatCurrency(loan.paid ?? 0)}
                </p>
              )}
            </div>

            {isStaff && (
              <Button className="w-full mt-4" onClick={() => setIsPaymentOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Record Payment
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <CardTitle>Computed Fields</CardTitle>
          <CardDescription className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Calculated by your sheet's formulas — never overwritten by this app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {computed.map((c) => (
              <div key={c.label} className="space-y-1">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-lg font-semibold font-numeric ${
                  c.highlight === "red" ? "text-destructive" :
                  c.highlight === "amber" ? "text-amber-600 dark:text-amber-400" :
                  ""
                }`}>{c.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Daily / Weekly Payment Tracker ── */}
      {(() => {
        const lnotes = (loan as any).notes as string | null;
        const lwhatsapp = loan.whatsapp as string | null;
        const text = `${lnotes ?? ""} ${lwhatsapp ?? ""}`.toLowerCase();
        const dailyMatch = text.match(/pay\s+daily\s+(\d+)/);
        const weeklyMatch = text.match(/pay\s+weekly\s+(\d+)/);
        if (!dailyMatch && !weeklyMatch) return null;

        const isDaily = !!dailyMatch;
        // Both buttons available when both patterns exist
        const dailyAmt = dailyMatch ? Number(dailyMatch[1]) : null;
        const weeklyAmt = weeklyMatch ? Number(weeklyMatch[1]) : null;
        const periodAmount = isDaily ? Number(dailyMatch![1]) : Number(weeklyMatch![1]);
        const periodLabel = isDaily ? "day" : "week";
        const daysPerPeriod = isDaily ? 1 : 7;

        const handleQuickPay = (amount: number, freq: "daily" | "weekly") => {
          if (!amount || dailyPending || weeklyPending || undoPending) return;
          // ── Guard: same-date duplicate ──
          if (loan.dateOfPartPayment === quickPayDate) {
            toast({ variant: "destructive", title: "Already recorded", description: `A payment for ${quickPayDate} is already recorded. Change the date to add another.` });
            return;
          }
          // ── Guard: today's payment already recorded ──
          if (freq === "daily" && dailyAmt != null && loan.transactionDate) {
            const nowD = new Date(); nowD.setHours(0, 0, 0, 0);
            const txD = new Date(loan.transactionDate + "T00:00:00Z");
            const elapsed = Math.max(differenceInCalendarDays(nowD, txD), 0);
            if (Math.floor((loan.paid ?? 0) / dailyAmt) >= elapsed) {
              toast({ variant: "destructive", title: "Already recorded", description: "Today's daily payment has already been recorded." });
              return;
            }
          }
          if (freq === "weekly" && weeklyAmt != null && loan.transactionDate) {
            const nowW = new Date(); nowW.setHours(0, 0, 0, 0);
            const txW = new Date(loan.transactionDate + "T00:00:00Z");
            const WDAYS = [8, 15, 22, 30];
            let wElapsed = 0;
            let wyr = txW.getFullYear(), wmo = txW.getMonth();
            wdone: for (let mi = 0; mi < 36; mi++) {
              for (const day of WDAYS) {
                const d = new Date(wyr, wmo, day);
                if (d <= txW) continue;
                if (d > nowW) break wdone;
                wElapsed++;
              }
              wmo++; if (wmo > 11) { wmo = 0; wyr++; }
            }
            if (Math.floor((loan.paid ?? 0) / weeklyAmt) >= wElapsed) {
              toast({ variant: "destructive", title: "Already recorded", description: "This period's weekly payment has already been recorded." });
              return;
            }
          }
          const setter = freq === "daily" ? setDailyPending : setWeeklyPending;
          setter(true);
          updateLoan.mutate(
            {
              id: loan.id,
              data: {
                paid: (loan.paid ?? 0) + amount,
                dateOfPartPayment: quickPayDate,
              },
            },
            {
              onSuccess: (updated) => {
                queryClient.setQueryData(getGetLoanQueryKey(loan.id), updated);
                queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
                toast({
                  title: `${freq === "daily" ? "Daily" : "Weekly"} payment recorded`,
                  description: `₹${amount.toLocaleString("en-IN")} added on ${quickPayDate}.`,
                });
              },
              onError: () => {
                toast({ variant: "destructive", title: "Error", description: "Could not record payment." });
              },
              onSettled: () => setter(false),
            },
          );
        };

        /** Undo last period payment — subtracts period amount from paid (floor at 0). */
        const handleUndo = (amount: number) => {
          if (undoPending || dailyPending || weeklyPending) return;
          const newPaid = Math.max((loan.paid ?? 0) - amount, 0);
          setUndoPending(true);
          updateLoan.mutate(
            { id: loan.id, data: { paid: newPaid } },
            {
              onSuccess: (updated) => {
                queryClient.setQueryData(getGetLoanQueryKey(loan.id), updated);
                queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
                toast({ title: "Payment undone", description: `₹${amount.toLocaleString("en-IN")} removed.` });
              },
              onError: () => {
                toast({ variant: "destructive", title: "Error", description: "Could not undo payment." });
              },
              onSettled: () => setUndoPending(false),
            },
          );
        };

        // +2% for daily, +1% for weekly "extra dues" amounts
        const dailyAmtExtra = dailyAmt ? Math.ceil(dailyAmt * 1.02) : null;
        const weeklyAmtExtra = weeklyAmt ? Math.ceil(weeklyAmt * 1.01) : null;

        if (!loan.transactionDate || periodAmount <= 0) return null;

        const txDate = new Date(loan.transactionDate + "T00:00:00Z");
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const daysElapsed = Math.max(differenceInCalendarDays(today, txDate), 0);
        // periodsElapsed: total periods including today (used for display of "X elapsed").
        // periodsElapsedForOverdue: excludes TODAY for daily loans — today's payment is
        // "due today", not yet overdue. This prevents 2 showing when only 1 is truly overdue.
        const periodsElapsed = isDaily
          ? daysElapsed
          : Math.max(Math.floor((daysElapsed - 1) / daysPerPeriod), 0);
        const periodsElapsedForOverdue = isDaily
          ? Math.max(daysElapsed - 1, 0)
          : periodsElapsed;
        const totalPaid = loan.paid ?? 0;
        // Count actual installments paid at the BASE rate only.
        // Using a fee-inflated divisor (dailyAmt × 1.02) when late would under-credit
        // paid periods (e.g. ₹9 000 ÷ ₹510 = 17.6 → 17 instead of 18) and manufacture
        // phantom extra overdue periods. Late fees are added on top separately.
        const paidPeriodsNormal = Math.floor(totalPaid / periodAmount);
        const overduePeriods = Math.max(periodsElapsedForOverdue - paidPeriodsNormal, 0);

        // Contract total = periods in tenure × per-period amount
        const totalPeriods = Math.floor((loan.tenureDays ?? 0) / daysPerPeriod);
        const contractTotal = totalPeriods * periodAmount;
        const remainingContract = Math.max(contractTotal - totalPaid, 0);

        // Accumulated overdue: daily uses 2%/day, weekly uses 1%/day
        const lateRate = isDaily ? 0.02 : 0.01;
        let overdueAccumulated = 0;
        for (let i = 1; i <= overduePeriods; i++) {
          const periodsLate = overduePeriods - i + 1;
          const daysLate = periodsLate * daysPerPeriod;
          overdueAccumulated += periodAmount * (1 + lateRate * daysLate);
        }
        overdueAccumulated = Math.ceil(overdueAccumulated);

        return (
          <Card className={`shadow-sm ${overduePeriods > 0 ? "border-destructive/30" : "border-border/60"}`}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    {dailyAmt && weeklyAmt ? "Daily / Weekly" : isDaily ? "Daily" : "Weekly"} Payment Tracker
                  </CardTitle>
                  <CardDescription>
                    {dailyAmt && <span>₹{dailyAmt.toLocaleString("en-IN")}/day</span>}
                    {dailyAmt && weeklyAmt && <span> · </span>}
                    {weeklyAmt && <span>₹{weeklyAmt.toLocaleString("en-IN")}/week</span>}
                    <span> · started {formatDate(loan.transactionDate)}</span>
                  </CardDescription>
                </div>
                {/* Quick-pay buttons + date picker + undo */}
                {isStaff && loan.status !== "Clear" && (
                  <div className="flex flex-col gap-2">
                    {/* Date picker row */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={quickPayDate}
                        onChange={(e) => setQuickPayDate(e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        title="Date to record this payment on"
                      />
                    </div>
                    {/* Pay buttons */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {dailyAmt != null && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-sky-500 text-sky-700 hover:bg-sky-50 gap-1.5"
                            onClick={() => handleQuickPay(dailyAmt, "daily")}
                            disabled={dailyPending || weeklyPending || undoPending}
                          >
                            {dailyPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <CalendarDays className="h-3.5 w-3.5" />}
                            Daily <span className="font-numeric font-semibold">₹{dailyAmt.toLocaleString("en-IN")}</span>
                          </Button>
                          {dailyAmtExtra != null && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-sky-400 text-sky-600 hover:bg-sky-50 gap-1 text-xs"
                              onClick={() => handleQuickPay(dailyAmtExtra, "daily")}
                              disabled={dailyPending || weeklyPending || undoPending}
                              title="+2% extra dues"
                            >
                              +2% <span className="font-numeric font-semibold">₹{dailyAmtExtra.toLocaleString("en-IN")}</span>
                            </Button>
                          )}
                        </>
                      )}
                      {weeklyAmt != null && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-violet-500 text-violet-700 hover:bg-violet-50 gap-1.5"
                            onClick={() => handleQuickPay(weeklyAmt, "weekly")}
                            disabled={dailyPending || weeklyPending || undoPending}
                          >
                            {weeklyPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <CalendarRange className="h-3.5 w-3.5" />}
                            Weekly <span className="font-numeric font-semibold">₹{weeklyAmt.toLocaleString("en-IN")}</span>
                          </Button>
                          {weeklyAmtExtra != null && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-violet-400 text-violet-600 hover:bg-violet-50 gap-1 text-xs"
                              onClick={() => handleQuickPay(weeklyAmtExtra, "weekly")}
                              disabled={dailyPending || weeklyPending || undoPending}
                              title="+1% extra dues"
                            >
                              +1% <span className="font-numeric font-semibold">₹{weeklyAmtExtra.toLocaleString("en-IN")}</span>
                            </Button>
                          )}
                        </>
                      )}
                      {/* Undo last payment */}
                      {(loan.paid ?? 0) > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive gap-1.5"
                          onClick={() => handleUndo(dailyAmt ?? weeklyAmt ?? 0)}
                          disabled={dailyPending || weeklyPending || undoPending}
                          title="Undo last period payment"
                        >
                          {undoPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RotateCcw className="h-3.5 w-3.5" />}
                          Undo
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{isDaily ? "Days" : "Weeks"} Elapsed</p>
                  <p className="text-xl font-bold font-numeric">{periodsElapsed}</p>
                  <p className="text-[10px] text-muted-foreground">of {totalPeriods} {periodLabel}s</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Paid to Date</p>
                  <p className="text-xl font-bold font-numeric text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(totalPaid)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{paidPeriodsNormal} {periodLabel}s paid</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Remaining (full contract)</p>
                  <p className="text-xl font-bold font-numeric">{formatCurrency(remainingContract)}</p>
                  <p className="text-[10px] text-muted-foreground">Total: {formatCurrency(contractTotal)}</p>
                </div>
                {overduePeriods > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-destructive">
                      {overduePeriods} overdue {periodLabel}{overduePeriods > 1 ? "s" : ""}
                    </p>
                    <p className="text-xl font-bold font-numeric text-destructive">
                      {formatCurrency(overdueAccumulated)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">incl. +1%/day late fee</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">✓ Caught up</p>
                    <p className="text-[10px] text-muted-foreground">No overdue payments</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Part Payments */}
      {(() => {
        const partPayments = (loan as any).partPayments as Array<{ date: string | null; amount: number }> | undefined;
        if (!partPayments || partPayments.length === 0) return null;
        return (
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-muted-foreground" /> Part Payments
              </CardTitle>
              <CardDescription>Partial payments recorded for this loan.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {partPayments.map((pp, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {pp.date ? formatDate(pp.date) : "Date not set"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Part payment #{i + 1}
                        {(() => {
                          const ts = ((loan as any).partPaymentTimestamps as string[] | undefined)?.[i];
                          if (!ts) return null;
                          return (
                            <span className="ml-1">
                              · Recorded {new Date(ts).toLocaleString("en-IN", {
                                day: "2-digit", month: "short", year: "numeric",
                                hour: "2-digit", minute: "2-digit", hour12: true,
                                timeZone: "Asia/Kolkata",
                              })}
                            </span>
                          );
                        })()}
                      </p>
                    </div>
                    <div className="font-bold font-numeric text-emerald-700 dark:text-emerald-400">
                      {pp.amount > 0 ? formatCurrency(pp.amount) : "—"}
                    </div>
                  </div>
                ))}
                {partPayments.length > 1 && (
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2 text-sm">
                    <span className="text-muted-foreground font-medium">Total part payments</span>
                    <span className="font-bold font-numeric">
                      {formatCurrency(partPayments.reduce((s, p) => s + p.amount, 0))}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Activity Log */}
      {(() => {
        const activityLog = ((loan as any).activityLog as string[] | undefined) ?? [];
        if (activityLog.length === 0) return null;
        const entries = activityLog
          .map(e => {
            const i = e.indexOf("~");
            if (i === -1) return null;
            const date = new Date(e.slice(0, i));
            if (isNaN(date.getTime())) return null;
            return { label: e.slice(i + 1), date };
          })
          .filter((e): e is { label: string; date: Date } => e !== null)
          .sort((a, b) => b.date.getTime() - a.date.getTime());
        if (entries.length === 0) return null;
        return (
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Activity Log
              </CardTitle>
              <CardDescription>All recorded actions on this loan, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative pl-6">
                <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
                <div className="space-y-4">
                  {entries.map((entry, i) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-[22px] top-1 h-3 w-3 rounded-full border-2 border-primary/50 bg-background" />
                      <p className="text-sm font-medium leading-snug">{entry.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.date.toLocaleString("en-IN", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit", hour12: true,
                          timeZone: "Asia/Kolkata",
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {isStaff && (
        <>
          <LoanFormDialog open={isEditOpen} onOpenChange={setIsEditOpen} loan={loan} />

          <RecordPaymentDialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen} loan={loan} />

          {/* Step 1 — initial warning */}
          <AlertDialog open={isDeleteStep1Open} onOpenChange={setIsDeleteStep1Open}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" /> Delete this loan?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the row from the Heat Map sheet. Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => { setIsDeleteStep1Open(false); setIsDeleteStep2Open(true); }}
                >
                  Yes, continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Step 2 — final irreversible confirmation */}
          <AlertDialog open={isDeleteStep2Open} onOpenChange={setIsDeleteStep2Open}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" /> This cannot be undone
                </AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to permanently delete the loan for <strong>{loan.name}</strong> ({loan.loanId}). The row will be removed from the sheet and cannot be recovered.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteLoan.isPending}
                >
                  {deleteLoan.isPending ? "Deleting..." : "Delete Permanently"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
