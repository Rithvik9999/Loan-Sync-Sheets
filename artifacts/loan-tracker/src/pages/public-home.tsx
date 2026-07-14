import { useAppAuth } from "@/hooks/use-app-auth";
import { Link } from "wouter";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex h-20 items-center justify-between px-6 md:px-12 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Logo />
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium hover:text-primary transition-colors">
            Sign In
          </Link>
          <Link href="/sign-up" className="hidden sm:inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
            Get Started
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center py-24">
        <div className="max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm text-primary font-medium">
            Private lending, professionalized.
          </div>
          <h1 className="font-serif text-5xl md:text-7xl font-semibold tracking-tight text-foreground text-balance">
            The precise ledger for private loans.
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Replace spreadsheet mixups with a single source of truth. Staff and borrowers see exactly the same schedule, payments, and balances.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/sign-up" className="w-full sm:w-auto h-12 px-8 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground font-medium shadow-md hover:bg-primary/90 transition-all hover:scale-105 active:scale-95">
              Start Tracking
            </Link>
            <Link href="/sign-in" className="w-full sm:w-auto h-12 px-8 inline-flex items-center justify-center rounded-md border border-input bg-background font-medium hover:bg-accent hover:text-accent-foreground transition-all">
              Borrower Portal
            </Link>
          </div>
        </div>

        {/* Decorative interface preview */}
        <div className="mt-24 w-full max-w-5xl rounded-xl border bg-card p-2 shadow-2xl shadow-primary/10 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200 fill-mode-both">
          <div className="rounded-lg border bg-background/50 overflow-hidden flex flex-col h-[400px]">
            <div className="flex h-12 items-center border-b px-4 gap-4 bg-muted/30">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-amber-400" />
                <div className="h-3 w-3 rounded-full bg-emerald-400" />
              </div>
              <div className="h-5 w-48 rounded bg-background border shadow-sm mx-auto" />
            </div>
            <div className="flex flex-1">
              <div className="w-48 border-r bg-muted/10 p-4 space-y-4 hidden md:block">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-4 w-32 rounded bg-muted/60" />
                <div className="h-4 w-20 rounded bg-muted/60" />
              </div>
              <div className="flex-1 p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-6 w-40 rounded bg-foreground/80" />
                    <div className="h-4 w-24 rounded bg-muted" />
                  </div>
                  <div className="h-10 w-24 rounded bg-primary/20" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="h-24 rounded-lg border bg-card p-4 space-y-3">
                    <div className="h-3 w-16 rounded bg-muted" />
                    <div className="h-6 w-24 rounded bg-foreground/70" />
                  </div>
                  <div className="h-24 rounded-lg border bg-card p-4 space-y-3">
                    <div className="h-3 w-20 rounded bg-muted" />
                    <div className="h-6 w-32 rounded bg-foreground/70" />
                  </div>
                  <div className="h-24 rounded-lg border bg-card p-4 space-y-3">
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-6 w-20 rounded bg-foreground/70" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <footer className="py-8 text-center text-sm text-muted-foreground border-t">
        <p>BorrowApp — Trust built on clarity.</p>
      </footer>
    </div>
  );
}
