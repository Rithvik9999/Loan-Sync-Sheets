import { useMemo, useState, useEffect } from "react";
import { useListLoans, getListLoansQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { MessageCircle, CheckCircle2, AlertTriangle, Clock, Send } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { fetchEmiLoans, EmiLoan } from "./emi-loans/components/emi-loan-form-dialog";

const SENT_STORAGE_KEY = "borrowapp_reminders_sent";
const REMINDER_WINDOW_DAYS = 5;
const SITE_NAME = "openr3.in";

type ReminderItem = {
  key: string;
  type: "loan" | "emi";
  id: string;
  loanId?: string;
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

function buildSingleReminderMessage(item: ReminderItem): string {
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
  if (item.loanId) lines.push(`🔖 ID: ${item.loanId}`);
  lines.push(`Please arrange payment at your earliest convenience. Thank you! 🙏`);
  lines.push(SITE_NAME);
  return lines.join("\n");
}

function buildCombinedReminderMessage(items: ReminderItem[], name: string): string {
  const lines = [`👋 Hi ${name},`];
  lines.push(`You have ${items.length} outstanding dues:`);
  items.forEach((item, i) => {
    const status =
      item.overdueDays > 0
        ? `Overdue by ${item.overdueDays}d`
        : item.dueDate
          ? `Due ${formatDate(item.dueDate)}`
          : "Due soon";
    const idPart = item.loanId ? ` [${item.loanId}]` : "";
    lines.push(
      `${i + 1}. ${item.type === "emi" ? "EMI" : "Loan"}${idPart}: ${formatCurrency(item.amount)} — ${status}`,
    );
  });
  const total = items.reduce((s, i) => s + i.amount, 0);
  lines.push(`\nTotal: ${formatCurrency(total)}`);
  lines.push(`Please arrange payment at your earliest convenience. Thank you! 🙏`);
  lines.push(SITE_NAME);
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
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  // Track the normalized phone of the currently-selected borrower.
  // Using phone (not name) as the stable key prevents cross-borrower data leakage
  // when two borrowers happen to share the same display name.
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

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
          loanId: l.loanId,
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
          loanId: l.emiId,
          name: l.name,
          phone: extractPhone(l.whatsapp),
          amount: l.monthlyPayment ?? l.principal,
          dueDate: l.nextPaymentDate ?? null,
          overdueDays,
        });
      }
    }

    return result.sort((a, b) => b.overdueDays - a.overdueDays);
  }, [loans, emiLoans]);

  const toggleSelect = (item: ReminderItem) => {
    const itemPhone = sanitizePhone(item.phone);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(item.key)) {
        next.delete(item.key);
        // Clear selectedPhone only when no items from this phone remain
        const remaining = [...next].filter(
          (k) => sanitizePhone(items.find((i) => i.key === k)?.phone ?? "") === itemPhone,
        );
        if (remaining.length === 0) setSelectedPhone(null);
      } else {
        next.add(item.key);
        setSelectedPhone(itemPhone); // gate on phone, not name
      }
      return next;
    });
  };

  const handleSendSingle = (item: ReminderItem) => {
    const phone = sanitizePhone(item.phone);
    if (phone.length !== 10) return;
    const msg = buildSingleReminderMessage(item);
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    const next = { ...sentMap, [item.key]: new Date().toISOString() };
    setSentMap(next);
    localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify(next));
  };

  const handleSendCombined = () => {
    const selectedItems = items.filter((i) => selectedKeys.has(i.key));
    if (selectedItems.length === 0) return;
    // Use the stable phone key — not item.phone — to avoid name-collision sending to wrong person
    if (!selectedPhone || selectedPhone.length !== 10) return;
    const name = selectedItems[0].name;
    const msg = buildCombinedReminderMessage(selectedItems, name);
    window.open(`https://wa.me/91${selectedPhone}?text=${encodeURIComponent(msg)}`, "_blank");
    const ts = new Date().toISOString();
    const next = { ...sentMap };
    selectedItems.forEach((i) => { next[i.key] = ts; });
    setSentMap(next);
    localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify(next));
    setSelectedKeys(new Set());
    setSelectedPhone(null);
  };

  const isLoading = isLoadingLoans || isLoadingEmi;
  const overdueCount = items.filter((i) => i.overdueDays > 0).length;
  const dueSoonCount = items.length - overdueCount;
  const selectedItems = items.filter((i) => selectedKeys.has(i.key));
  // Display name from any selected item (all guaranteed to share the same phone)
  const selectedDisplayName = selectedItems[0]?.name ?? "";

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Borrowers overdue or due within {REMINDER_WINDOW_DAYS} days — send a WhatsApp reminder in one tap. Select multiple from the same borrower to send a combined message.
      </p>

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

      {/* Combined send bar */}
      {selectedKeys.size > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-sm font-medium text-emerald-800">
            {selectedKeys.size} dues selected for {selectedDisplayName}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setSelectedKeys(new Set()); setSelectedPhone(null); }}
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={handleSendCombined}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Send Combined
            </Button>
          </div>
        </div>
      )}

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
                const isSelected = selectedKeys.has(item.key);
                // Disable if a different user's items are selected
                const itemPhone = sanitizePhone(item.phone);
                // Disable items whose phone differs from the currently-selected phone.
                // Gating on phone (not name) prevents cross-borrower data leakage
                // when two borrowers share the same display name.
                const isDisabled =
                  !hasPhone ||
                  (selectedPhone !== null && itemPhone !== selectedPhone && selectedKeys.size > 0);
                return (
                  <div
                    key={item.key}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 ${isDisabled && !isSelected ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox
                        checked={isSelected}
                        disabled={isDisabled && !isSelected}
                        onCheckedChange={() => toggleSelect(item)}
                        aria-label={`Select ${item.name}`}
                      />
                      {item.overdueDays > 0 ? (
                        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.type === "emi" ? "EMI" : "Loan"}
                          {item.loanId && (
                            <span className="font-mono ml-1 text-[10px]">[{item.loanId}]</span>
                          )}
                          {" · "}{formatCurrency(item.amount)}
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
                        onClick={() => handleSendSingle(item)}
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
