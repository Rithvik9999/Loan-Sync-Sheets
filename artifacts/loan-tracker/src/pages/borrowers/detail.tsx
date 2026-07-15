import { useParams } from "wouter";
import { useState } from "react";
import {
  useGetBorrower,
  useDeleteBorrower,
  useListLoans,
  getGetBorrowerQueryKey,
  getListBorrowersQueryKey,
  getListLoansQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import {
  ArrowLeft, Edit, Trash2, Mail, Phone, Calendar, ChevronRight,
} from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { LoanStatusBadge } from "@/components/status-badges";
import BorrowerFormDialog from "./components/borrower-form-dialog";

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
import { EmptyState } from "@/components/empty-state";

export default function BorrowerDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { data: borrower, isLoading: isBorrowerLoading } = useGetBorrower(id, {
    query: { queryKey: getGetBorrowerQueryKey(id), enabled: !!id },
  });

  // The Heat Map sheet has no borrower foreign key — loans are matched by
  // name — so we fetch every loan and filter client-side to this borrower.
  const { data: allLoans, isLoading: isLoansLoading } = useListLoans(undefined, {
    query: { queryKey: getListLoansQueryKey(), enabled: !!borrower },
  });
  const loans = allLoans?.filter(
    (l) => l.name.trim().toLowerCase() === borrower?.name.trim().toLowerCase(),
  );

  const deleteBorrower = useDeleteBorrower();

  const handleDelete = () => {
    deleteBorrower.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBorrowersQueryKey() });
          toast({ title: "Borrower deleted", description: "The profile has been removed." });
          setLocation("/borrowers");
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Could not delete borrower." });
          setIsDeleteOpen(false);
        },
      },
    );
  };

  if (isBorrowerLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!borrower) {
    return <div className="py-12 text-center">Borrower not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link href="/borrowers"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground font-serif">{borrower.name}</h1>
          <p className="text-muted-foreground mt-1">Borrower Profile</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
            <Edit className="h-4 w-4 mr-2" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setIsDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 shadow-sm border-border/60 h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Contact Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <a href={`mailto:${borrower.email}`} className="text-sm text-primary hover:underline">{borrower.email}</a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-sm text-muted-foreground">{borrower.phone || "Not provided"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Added On</p>
                <p className="text-sm text-muted-foreground">{formatDate(borrower.createdAt)}</p>
              </div>
            </div>

            {borrower.hasPassword && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 font-normal hover:bg-emerald-100 flex w-fit">
                  Portal Access Enabled
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  This borrower can sign in to view their loans.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-lg">Loans</CardTitle>
              <CardDescription>Heat Map rows whose name matches this borrower.</CardDescription>
            </div>
            <Button size="sm" asChild>
              <Link href={`/loans/new?name=${encodeURIComponent(borrower.name)}`}>
                New Loan
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoansLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !loans || loans.length === 0 ? (
              <EmptyState
                title="No loans"
                description="This borrower has no loan history."
              />
            ) : (
              <div className="space-y-3">
                {loans.map((loan) => (
                  <Link
                    key={loan.id}
                    href={`/loans/${loan.id}`}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold font-numeric">{formatCurrency(loan.principal)}</span>
                        <LoanStatusBadge status={loan.status} />
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-3">
                        <span>Transacted {formatDate(loan.transactionDate)}</span>
                        <span>•</span>
                        <span>{loan.tenureDays} days</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BorrowerFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        borrower={borrower}
      />

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the borrower profile for {borrower.name}. This does not delete their loan
              rows on the Heat Map sheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBorrower.isPending}
            >
              {deleteBorrower.isPending ? "Deleting..." : "Delete Borrower"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
