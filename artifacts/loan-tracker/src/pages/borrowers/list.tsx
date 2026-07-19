import { useListBorrowers, getListBorrowersQueryKey, useListLoans, getListLoansQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, ChevronRight, Users, Phone, KeyRound, Landmark, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import BorrowerFormDialog from "./components/borrower-form-dialog";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { EmiLoan, EMI_LOANS_QUERY_KEY, fetchEmiLoans } from "@/pages/emi-loans/components/emi-loan-form-dialog";

interface BorrowerEntry {
  id: string | null;
  name: string;
  phone: string;
  hasPin: boolean;
  creditLimit: number | null;
  loanCount: number;
  creditUsed: number;   // sum of active loan principals
  totalDue: number;     // sum of actual outstanding amounts (finalAmount - paid, plus EMI)
}

// ── Change PIN Dialog ─────────────────────────────────────────────────────────

function ChangePinDialog({
  open,
  onOpenChange,
  borrowerId,
  borrowerName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  borrowerId: string;
  borrowerName: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const [isPending, setIsPending] = useState(false);

  function handleClose() {
    setPin("");
    onOpenChange(false);
  }

  async function handleSave() {
    if (!/^\d{6}$/.test(pin)) {
      toast({ variant: "destructive", title: "Invalid PIN", description: "PIN must be exactly 6 digits." });
      return;
    }
    setIsPending(true);
    try {
      // Dedicated /pin endpoint syncs the PIN to every row sharing the same
      // phone, so login (which uses first-match-by-phone) always sees the new PIN.
      const res = await fetch(`/api/borrowers/${borrowerId}/pin`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to update PIN");
      }
      queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
      toast({ title: "PIN updated", description: `${borrowerName}'s login PIN has been changed.` });
      handleClose();
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Could not update PIN." });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Change PIN</DialogTitle>
          <DialogDescription>
            Set a new 6-digit login PIN for <strong>{borrowerName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label className="text-sm font-medium">New PIN (6 digits)</label>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="••••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
          {pin.length > 0 && pin.length < 6 && (
            <p className="text-xs text-muted-foreground">{6 - pin.length} more digit{6 - pin.length !== 1 ? "s" : ""} needed</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || pin.length !== 6}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save PIN
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Set Credit Limit Dialog ───────────────────────────────────────────────────

function SetLimitDialog({
  open,
  onOpenChange,
  borrowerId,
  borrowerName,
  currentLimit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  borrowerId: string;
  borrowerName: string;
  currentLimit: number | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(currentLimit != null ? String(currentLimit) : "");
  const [isPending, setIsPending] = useState(false);

  async function handleSave() {
    const limit = value.trim() === "" ? null : Number(value);
    if (limit !== null && (isNaN(limit) || limit <= 0)) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Enter a positive number or leave blank to remove the limit." });
      return;
    }
    setIsPending(true);
    try {
      const res = await fetch(`/api/borrowers/${borrowerId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditLimit: limit }),
      });
      if (!res.ok) throw new Error("Failed to update limit");
      queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
      toast({
        title: "Credit limit updated",
        description: limit != null ? `${borrowerName}'s limit is now ${formatCurrency(limit)}.` : `Credit limit removed for ${borrowerName}.`,
      });
      onOpenChange(false);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not update credit limit." });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Set Credit Limit</DialogTitle>
          <DialogDescription>
            Set the maximum total borrowing allowed for <strong>{borrowerName}</strong>. Leave blank to remove the limit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label className="text-sm font-medium">Limit Amount (₹)</label>
          <Input
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 100000"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          {value && Number(value) > 0 && (
            <p className="text-xs text-muted-foreground">= {formatCurrency(Number(value))}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Limit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BorrowersList() {
  const [search, setSearch] = useState("");
  const [setupName, setSetupName] = useState<string | null>(null);
  const [setupPhone, setSetupPhone] = useState<string>("");
  // Separate state for editing an existing borrower's PIN (passes full borrower obj to dialog)
  const [pinTarget, setPinTarget] = useState<{ id: string; name: string } | null>(null);
  const [limitTarget, setLimitTarget] = useState<{ id: string; name: string; currentLimit: number | null } | null>(null);

  const { data: borrowers, isLoading: isLoadingBorrowers } = useListBorrowers({
    query: { queryKey: getListBorrowersQueryKey() },
  });

  const { data: loans, isLoading: isLoadingLoans } = useListLoans(undefined, {
    query: { queryKey: getListLoansQueryKey() },
  });

  const { data: emiLoans, isLoading: isLoadingEmi } = useQuery<EmiLoan[]>({
    queryKey: EMI_LOANS_QUERY_KEY,
    queryFn: fetchEmiLoans,
  });

  const isLoading = isLoadingBorrowers || isLoadingLoans || isLoadingEmi;

  // Build unified borrower list. Loan-sheet rows and Borrowers-tab records are
  // matched primarily by normalized phone number (more reliable than name,
  // since names can differ slightly in spacing/case/nicknames between the two
  // sheets) and fall back to normalized name when no phone is available.
  const directory: BorrowerEntry[] = (() => {
    const normPhone = (p: string) => p.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
    const normName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, "");

    const entries: BorrowerEntry[] = [];
    const byPhone = new Map<string, BorrowerEntry>();
    const byName = new Map<string, BorrowerEntry>();

    const findExisting = (phone: string, name: string): BorrowerEntry | undefined => {
      const p = normPhone(phone);
      if (p && byPhone.has(p)) return byPhone.get(p);
      const n = normName(name);
      if (n && byName.has(n)) return byName.get(n);
      return undefined;
    };

    const index = (entry: BorrowerEntry) => {
      const p = normPhone(entry.phone);
      const n = normName(entry.name);
      if (p) byPhone.set(p, entry);
      if (n) byName.set(n, entry);
    };

    for (const loan of loans ?? []) {
      const phone = (loan.whatsapp ?? "").split("\n")[0].trim();
      const existing = findExisting(phone, loan.name);
      if (existing) {
        existing.loanCount++;
        if (!existing.phone && phone) {
          existing.phone = phone;
          index(existing);
        }
        // Accumulate active loan principal and outstanding dues
        if (loan.status !== "Clear") {
          existing.creditUsed += (loan.principal ?? 0);
          existing.totalDue += Math.max((loan.finalAmount ?? 0) - (loan.paid ?? 0), 0);
        }
      } else {
        const entry: BorrowerEntry = {
          id: null,
          name: loan.name.trim(),
          phone,
          hasPin: false,
          creditLimit: null,
          loanCount: 1,
          creditUsed: loan.status !== "Clear" ? (loan.principal ?? 0) : 0,
          totalDue: loan.status !== "Clear" ? Math.max((loan.finalAmount ?? 0) - (loan.paid ?? 0), 0) : 0,
        };
        entries.push(entry);
        index(entry);
      }
    }

    for (const b of borrowers ?? []) {
      const existing = findExisting(b.phone ?? "", b.name);
      if (existing) {
        // First-wins for ID: use the first Borrowers-tab record's ID so the
        // admin always edits the same row that getBorrowerByPhone (login) finds.
        if (!existing.id) existing.id = b.id;
        existing.hasPin = b.hasPin ?? false;
        // Prefer a non-null credit limit — null from a duplicate row must not
        // overwrite a limit the admin has already set on another row.
        existing.creditLimit = b.creditLimit ?? existing.creditLimit;
        existing.name = b.name.trim();
        if (b.phone) {
          existing.phone = b.phone;
        }
        index(existing);
      } else {
        const entry: BorrowerEntry = {
          id: b.id,
          name: b.name.trim(),
          phone: b.phone ?? "",
          hasPin: b.hasPin ?? false,
          creditLimit: b.creditLimit ?? null,
          loanCount: 0,
          creditUsed: 0,
          totalDue: 0,
        };
        entries.push(entry);
        index(entry);
      }
    }

    // Add active EMI loan amounts per borrower
    for (const emi of emiLoans ?? []) {
      if (emi.status === "Clear") continue;
      const phone = ((emi as unknown as { whatsapp?: string }).whatsapp ?? "").split("\n")[0].trim();
      const existing = findExisting(phone, emi.name);
      if (existing) {
        // Credit Used: remaining principal (accounts for partially paid EMI months).
        // Uses principalPerMonth × remainingMonths when available; falls back to
        // proportional estimate or full principal if tracking hasn't started yet.
        const rem = emi.remainingMonths != null ? Math.max(emi.remainingMonths, 0) : null;
        if (rem != null && emi.principalPerMonth != null) {
          existing.creditUsed += emi.principalPerMonth * rem;
        } else if (rem != null && emi.tenureMonths > 0) {
          existing.creditUsed += Math.round((emi.principal ?? 0) * rem / emi.tenureMonths);
        } else {
          existing.creditUsed += (emi.principal ?? 0);
        }
        // Total Due: actual financial obligation — monthlyPayment × remaining months
        if (rem != null) {
          existing.totalDue += emi.monthlyPayment != null
            ? emi.monthlyPayment * rem
            : (emi.principal ?? 0);
        } else {
          existing.totalDue += (emi.principal ?? 0);
        }
      }
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  })();

  const filtered = directory.filter(
    (b) => b.name.toLowerCase().includes(search.toLowerCase()) || b.phone.includes(search),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div />
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone…"
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : directory.length === 0 ? (
            <EmptyState title="No borrowers yet" description="Record a loan to see borrowers appear here." icon={<Users />} />
          ) : filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Loans</TableHead>
                  <TableHead>Credit Limit</TableHead>
                  <TableHead>Credit Used</TableHead>
                  <TableHead>Total Due</TableHead>
                  <TableHead>Portal Access</TableHead>
                  <TableHead className="w-[160px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.name} className="group">
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.phone ? (
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{b.phone}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.loanCount}</TableCell>
                    <TableCell>
                      {b.creditLimit != null ? (
                        <span className="font-numeric text-sm font-medium">{formatCurrency(b.creditLimit)}</span>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">No limit</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {b.creditUsed > 0 ? (
                        <span className={`font-numeric text-sm font-medium ${b.creditLimit != null && b.creditUsed > b.creditLimit ? "text-destructive" : "text-foreground"}`}>
                          {formatCurrency(b.creditUsed)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {b.totalDue > 0 ? (
                        <span className="font-numeric text-sm font-medium text-destructive">
                          {formatCurrency(b.totalDue)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {b.hasPin ? (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal gap-1">
                          <KeyRound className="h-3 w-3" />
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground font-normal">Not set up</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {b.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setLimitTarget({ id: b.id!, name: b.name, currentLimit: b.creditLimit })}
                          >
                            <Landmark className="h-3 w-3 mr-1" />
                            Limit
                          </Button>
                        )}
                        {b.id ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => setPinTarget({ id: b.id!, name: b.name })}
                            >
                              Edit PIN
                            </Button>
                            <Button variant="ghost" size="icon" asChild>
                              <Link href={`/borrowers/${b.id}`}>
                                <ChevronRight className="h-4 w-4" />
                                <span className="sr-only">View</span>
                              </Link>
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => { setSetupName(b.name); setSetupPhone(b.phone); }}
                          >
                            Set up login
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-muted-foreground">No borrowers match your search.</div>
          )}
        </CardContent>
      </Card>

      {/* Change PIN for existing borrower */}
      {pinTarget && (
        <ChangePinDialog
          open={pinTarget !== null}
          onOpenChange={(open) => { if (!open) setPinTarget(null); }}
          borrowerId={pinTarget.id}
          borrowerName={pinTarget.name}
        />
      )}
      {/* Set up new borrower login */}
      <BorrowerFormDialog
        open={setupName !== null}
        onOpenChange={(open) => { if (!open) setSetupName(null); }}
        defaultName={setupName ?? undefined}
        defaultPhone={setupPhone}
      />

      {limitTarget && (
        <SetLimitDialog
          open={limitTarget !== null}
          onOpenChange={(open) => { if (!open) setLimitTarget(null); }}
          borrowerId={limitTarget.id}
          borrowerName={limitTarget.name}
          currentLimit={limitTarget.currentLimit}
        />
      )}
    </div>
  );
}
