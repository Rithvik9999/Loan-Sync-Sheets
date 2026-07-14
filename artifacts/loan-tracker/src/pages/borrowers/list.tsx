import { useListBorrowers, getListBorrowersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronRight, UserPlus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { useState } from "react";
import BorrowerFormDialog from "./components/borrower-form-dialog";

export default function BorrowersList() {
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const { data: borrowers, isLoading } = useListBorrowers({
    query: { queryKey: getListBorrowersQueryKey() }
  });

  const filtered = borrowers?.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase()) || 
    b.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">Borrowers</h1>
          <p className="text-muted-foreground mt-1">Manage borrower profiles and contact information.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Add Borrower
        </Button>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search borrowers..."
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !borrowers || borrowers.length === 0 ? (
            <EmptyState
              title="No borrowers yet"
              description="Add a borrower to start tracking their loans."
              icon={<UserPlus />}
              action={
                <Button onClick={() => setIsCreateOpen(true)}>
                  Add Borrower
                </Button>
              }
            />
          ) : filtered && filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Added On</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((borrower) => (
                  <TableRow key={borrower.id} className="group">
                    <TableCell className="font-medium">{borrower.name}</TableCell>
                    <TableCell>{borrower.email}</TableCell>
                    <TableCell className="text-muted-foreground">{borrower.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(borrower.createdAt)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/borrowers/${borrower.id}`}>
                          <ChevronRight className="h-4 w-4" />
                          <span className="sr-only">View</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              No borrowers match your search.
            </div>
          )}
        </CardContent>
      </Card>

      <BorrowerFormDialog 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen} 
      />
    </div>
  );
}
