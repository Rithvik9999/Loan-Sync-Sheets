import { useListBorrowers, getListBorrowersQueryKey, useListLoans, getListLoansQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronRight, Users, Phone, KeyRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useState } from "react";
import BorrowerFormDialog from "./components/borrower-form-dialog";

interface BorrowerEntry {
  id: string | null;
  name: string;
  phone: string;
  hasPassword: boolean;
  loanCount: number;
}

export default function BorrowersList() {
  const [search, setSearch] = useState("");
  const [setupName, setSetupName] = useState<string | null>(null);
  const [setupPhone, setSetupPhone] = useState<string>("");

  const { data: borrowers, isLoading: isLoadingBorrowers } = useListBorrowers({
    query: { queryKey: getListBorrowersQueryKey() },
  });

  const { data: loans, isLoading: isLoadingLoans } = useListLoans(undefined, {
    query: { queryKey: getListLoansQueryKey() },
  });

  const isLoading = isLoadingBorrowers || isLoadingLoans;

  // Build unified borrower list from Heat Map unique names
  const directory: BorrowerEntry[] = (() => {
    const nameMap = new Map<string, BorrowerEntry>();

    // Seed from loans (unique names + phone from whatsapp)
    for (const loan of loans ?? []) {
      const key = loan.name.trim().toLowerCase();
      if (!nameMap.has(key)) {
        const phone = (loan.whatsapp ?? "").split("\n")[0].trim();
        nameMap.set(key, {
          id: null,
          name: loan.name.trim(),
          phone,
          hasPassword: false,
          loanCount: 0,
        });
      }
      nameMap.get(key)!.loanCount++;
    }

    // Overlay portal access data from Borrowers tab
    for (const b of borrowers ?? []) {
      const key = b.name.trim().toLowerCase();
      if (nameMap.has(key)) {
        const entry = nameMap.get(key)!;
        entry.id = b.id;
        entry.hasPassword = b.hasPassword ?? false;
        if (!entry.phone && b.phone) entry.phone = b.phone;
      } else {
        // Borrower in portal tab but no loans — still show them
        nameMap.set(key, {
          id: b.id,
          name: b.name.trim(),
          phone: b.phone ?? "",
          hasPassword: b.hasPassword ?? false,
          loanCount: 0,
        });
      }
    }

    return Array.from(nameMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const filtered = directory.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.phone.includes(search),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">Borrowers</h1>
          <p className="text-muted-foreground mt-1">
            All borrowers from your Heat Map sheet. Set up portal access so they can log in.
          </p>
        </div>
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
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : directory.length === 0 ? (
            <EmptyState
              title="No borrowers yet"
              description="Record a loan to see borrowers appear here."
              icon={<Users />}
            />
          ) : filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Loans</TableHead>
                  <TableHead>Portal Access</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.name} className="group">
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {b.phone}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.loanCount}</TableCell>
                    <TableCell>
                      {b.hasPassword ? (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal gap-1">
                          <KeyRound className="h-3 w-3" />
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground font-normal">
                          Not set up
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {b.id ? (
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/borrowers/${b.id}`}>
                              <ChevronRight className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              setSetupName(b.name);
                              setSetupPhone(b.phone);
                            }}
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

      {/* Dialog for setting up portal access for a name-only borrower */}
      <BorrowerFormDialog
        open={setupName !== null}
        onOpenChange={(open) => { if (!open) setSetupName(null); }}
        defaultName={setupName ?? undefined}
        defaultPhone={setupPhone}
      />
    </div>
  );
}
