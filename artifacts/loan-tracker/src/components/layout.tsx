import { Link, useLocation } from "wouter";
import { useAppAuth } from "@/hooks/use-app-auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  LogOut,
  Loader2,
  ClipboardList,
  CalendarClock,
  Clock,
  UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const staffNav = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Borrowers", href: "/borrowers", icon: Users },
  { title: "Loans", href: "/loans", icon: CreditCard },
  { title: "EMI Loans", href: "/emi-loans", icon: CalendarClock },
  { title: "Loan Requests", href: "/loan-requests", icon: ClipboardList },
  { title: "Recents", href: "/recents", icon: Clock },
];

export function SharedLayout({ children }: { children: React.ReactNode }) {
  const { role, name, isLoaded, isSignedIn, logout } = useAppAuth();
  const [location] = useLocation();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await logout();
    window.location.href = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") + "/sign-in";
  };

  return (
    <div className="flex min-h-screen bg-muted/30 flex-col md:flex-row">
      {/* Sidebar — staff only on desktop */}
      {role === "staff" && (
        <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar px-4 py-6">
          {/* App name / logo */}
          <div className="mb-3 pl-2">
            <Logo />
          </div>

          {/* User name */}
          {name && (
            <div className="mb-6 pl-2 flex items-center gap-2 text-sm text-sidebar-foreground/70">
              <UserCircle2 className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">{name}</span>
            </div>
          )}

          <nav className="flex-1 space-y-1">
            {staffNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  location.startsWith(item.href)
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            ))}
          </nav>
          <div className="mt-auto">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </aside>
      )}

      {/* Top header — mobile always, desktop only for borrowers */}
      <header
        className={cn(
          "flex h-14 items-center justify-between border-b bg-sidebar px-4",
          role === "staff" ? "md:hidden" : "flex",
        )}
      >
        <div className="flex items-center gap-3">
          <Logo />
          {name && role !== "staff" && (
            <span className="text-sm font-medium text-sidebar-foreground/70 truncate max-w-[140px]">
              {name}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </header>

      {/* Mobile Nav Links — staff only */}
      {role === "staff" && (
        <div className="md:hidden flex overflow-x-auto border-b bg-sidebar px-1.5 py-1.5 hide-scrollbar gap-0.5">
          {staffNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 flex-col items-center gap-0.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors",
                location.startsWith(item.href)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          ))}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="flex-1 mx-auto w-full max-w-5xl p-4 md:p-8 animate-in fade-in-50 duration-500">
          {children}
        </div>
        <footer className="border-t px-4 py-2.5 text-center text-[10px] text-muted-foreground/50 bg-background/50">
          🎮 This is a game — all names, amounts, and transactions are entirely fictional. No real money or real people are involved.
        </footer>
      </main>
    </div>
  );
}
