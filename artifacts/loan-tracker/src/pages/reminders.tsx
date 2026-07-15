import { useMemo, useState, useEffect } from "react";
import { useListLoans, getListLoansQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { MessageCircle, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { fetchEmiLoans, EmiLoan } from "./emi-loans/components/emi-loan-form-dialog";

const SENT_STORAGE_KEY = "borrowapp_reminders_sent";
const REMINDER_WINDOW_DAYS = 5;

type ReminderItem = {
  key: string;
  type: "loan" | "emi";
  id: string;
  name: string;
  phone: string;
  amount: number;
  dueDate: string | null;
  overdueDays: number; // > 0 means overdue
};

function loadSentMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SENT_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function extractPhone(whatsapp: string | null | undefined): string {
  return (whatsapp ?? "").split("\n")[0].trim();
}

function sanitizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  return digits.slice(0, 10);
}

function buildReminderMessage(item: ReminderItem): string {
  const lines = [`👋 Hi ${item.name},`];
  if (item.overdueDays > 0) {
    lines.push(
      `Your ${item.type === "emi" ? "EMI" : "loan"} payment of ${formatCurrency(item.amount)} is overdue by ${item.overdueDays} day${item.overdueDays !== 1 ? "s" : ""}.`,
    );
  } else {
    lines.push(
      `This is a reminder that your ${item.type === "emi" ? "EMI" : "loan"} payment of ${formatCurrency(item.amount)} is due${item.dueDate ? ` on ${formatDate(item.dueDate)}` : " soon"}.`,
    );
  }
  lines.push(`Please arrange payment at your earliest convenience. Thank you! 🙏`);
  return lines.join("\n");
}

export default function Reminders() {
  const { data: loans, isLoading: isLoadingLoans } = useListLoans(undefined, {
    query: { queryKey: getListLoansQueryKey() },
  });
  const { data: emiLoans, isLoading: isLoadingEmi } = useQuery<EmiLoan[]>({
    queryKey: ["emi-loans"],
    queryFn: fetchEmiLoans,
  });

  const [sentMap, setSentMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setSentMap(loadSentMap());
  }, []);

  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const items: ReminderItem[] = useMemo(() => {
    const result: ReminderItem[] = [];

    for (const l of loans ?? []) {
      if (l.status === "Clear") continue;
      const overdueDays = l.lateDays ?? 0;
      const due = l.returnDate ? new Date(l.returnDate) : null;
      const dueSoon = due != null && due >= now && due <= windowEnd;
      if (overdueDays > 0 || dueSoon) {
        result.push({
          key: `loan-${l.id}`,
          type: "loan",
          id: l.id,
          name: l.name,
          phone: extractPhone(l.whatsapp),
          amount: l.finalAmount ?? l.principal,
          dueDate: l.returnDate ?? null,
          overdueDays,
        });
      }
    }

    for (const l of emiLoans ?? []) {
      if (l.status === "Clear") continue;
      const due = l.nextPaymentDate ? new Date(l.nextPaymentDate) : null;
      const overdueDays = due && due < now ? Math.floor((now.getTime() - due.getTime()) / 86400000) : 0;
      const dueSoon = due != null && due >= now && due <= windowEnd;
      if (overdueDays > 0 || dueSoon) {
        result.push({
          key: `emi-${l.id}`,
          type: "emi",
          id: l.id,
          name: l.name,
          phone: extractPhone(l.whatsapp),
          amount: l.monthlyPayment ?? l.principal,
          dueDate: l.nextPaymentDate ?? null,
          overdueDays,
        });
      }
    }

    return result.sort((a, b) => b.overdueDays - a.overdueDays);
  }, [loans, emiLoans, now, windowEnd]);

  const handleSend = (item: ReminderItem) => {
    const phone = sanitizePhone(item.phone);
    if (phone.length !== 10) return;
    const msg = buildReminderMessage(item);
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    const next = { ...sentMap, [item.key]: new Date().toISOString() };
    setSentMap(next);
    localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify(next));
  };

  const isLoading = isLoadingLoans || isLoadingEmi;
  const overdueCount = items.filter((i) => i.overdueDays > 0).length;
  const dueSoonCount = items.length - overdueCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">
          Reminders
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Borrowers who are overdue or due within {REMINDER_WINDOW_DAYS} days — send a WhatsApp reminder in one tap.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-md">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-2xl font-bold font-numeric text-destructive">{overdueCount}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-300/50 bg-amber-50">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Due soon</p>
            <p className="text-2xl font-bold font-numeric text-amber-700">{dueSoonCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <CardTitle>Send Reminders</CardTitle>
          <CardDescription>
            "Sent" is tracked on this device only — it resets if you clear your browser data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="Nothing to remind"
              description="No borrowers are overdue or due soon. Check back later."
              icon={<CheckCircle2 />}
            />
          ) : (
            <div className="divide-y">
              {items.map((item) => {
                const sentAt = sentMap[item.key];
                const hasPhone = sanitizePhone(item.phone).length === 10;
                return (
                  <div
                    key={item.key}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.overdueDays > 0 ? (
                        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.type === "emi" ? "EMI" : "Loan"} · {formatCurrency(item.amount)}
                          {item.overdueDays > 0 ? (
                            <span className="text-destructive"> · {item.overdueDays}d overdue</span>
                          ) : (
                            item.dueDate && <span> · due {formatDate(item.dueDate)}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {sentAt && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          Sent {formatDate(sentAt)}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={sentAt ? "outline" : "default"}
                        disabled={!hasPhone}
                        onClick={() => handleSend(item)}
                        className={sentAt ? "" : "bg-emerald-700 hover:bg-emerald-800 text-white"}
                        title={!hasPhone ? "No phone number on file" : undefined}
                      >
                        <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                        {sentAt ? "Send Again" : "Send"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
