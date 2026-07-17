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
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface BorrowerEntry {
  id: string | null;
  name: string;
  phone: string;
  hasPin: boolean;
  creditLimit: number | null;
  loanCount: number;
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
  const [pinEditTarget, setPinEditTarget] = useState<BorrowerEntry | null>(null);
  const [limitTarget, setLimitTarget] = useState<{ id: string; name: string; currentLimit: number | null } | null>(null);

  const { data: borrowers, isLoading: isLoadingBorrowers } = useListBorrowers({
    query: { queryKey: getListBorrowersQueryKey() },
  });

  const { data: loans, isLoading: isLoadingLoans } = useListLoans(undefined, {
    query: { queryKey: getListLoansQueryKey() },
  });

  const isLoading = isLoadingBorrowers || isLoadingLoans;

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
      } else {
        const entry: BorrowerEntry = {
          id: null,
          name: loan.name.trim(),
          phone,
          hasPin: false,
          creditLimit: null,
          loanCount: 1,
        };
        entries.push(entry);
        index(entry);
      }
    }

    for (const b of borrowers ?? []) {
      const existing = findExisting(b.phone ?? "", b.name);
      if (existing) {
        existing.id = b.id;
        existing.hasPin = b.hasPin ?? false;
        existing.creditLimit = b.creditLimit ?? null;
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
        };
        entries.push(entry);
        index(entry);
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
                              onClick={() => setPinEditTarget(b)}
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

      {/* Edit existing borrower PIN */}
      <BorrowerFormDialog
        open={pinEditTarget !== null}
        onOpenChange={(open) => { if (!open) setPinEditTarget(null); }}
        borrower={pinEditTarget ? {
          id: pinEditTarget.id!,
          name: pinEditTarget.name,
          phone: pinEditTarget.phone,
          creditLimit: pinEditTarget.creditLimit,
          hasPin: pinEditTarget.hasPin,
        } as Parameters<typeof BorrowerFormDialog>[0]["borrower"]}
      />
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
