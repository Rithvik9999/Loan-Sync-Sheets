import { Link, useLocation } from "wouter";
import { useAppAuth } from "@/hooks/use-app-auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, CreditCard, LogOut, Loader2, Menu } from "lucide-react";
import { useClerk } from "@clerk/react";
import { cn } from "@/lib/utils";

const staffNav = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Borrowers", href: "/borrowers", icon: Users },
  { title: "Loans", href: "/loans", icon: CreditCard },
];

export function SharedLayout({ children }: { children: React.ReactNode }) {
  const { role, isLoaded, isSignedIn } = useAppAuth();
  const [location] = useLocation();
  const { signOut } = useClerk();
  
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
      </div>
    );
  }

  // If not signed in, render just the content (should only happen for public pages catching this layout)
  if (!isSignedIn) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-muted/30 flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar px-4 py-6">
        <div className="mb-8 pl-2">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1">
          {role === "staff" ? (
            staffNav.map((item) => (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  location.startsWith(item.href) 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            ))
          ) : (
            <Link 
              href="/portal"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                location.startsWith("/portal") 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              My Portal
            </Link>
          )}
        </nav>
        <div className="mt-auto">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL.replace(/\/$/, '') || "/" })}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Topnav */}
      <header className="flex h-16 items-center justify-between border-b bg-sidebar px-4 md:hidden">
        <Logo />
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL.replace(/\/$/, '') || "/" })}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>
      
      {/* Mobile Nav Links - sticky bottom or just let them use top for now since simple */}
      <div className="md:hidden flex overflow-x-auto border-b bg-sidebar px-2 py-2 hide-scrollbar">
        {role === "staff" ? (
          staffNav.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors mx-1",
                location.startsWith(item.href) 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          ))
        ) : (
          <Link 
            href="/portal"
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors mx-1",
              location.startsWith("/portal") 
                ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            My Portal
          </Link>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl p-4 md:p-8 animate-in fade-in-50 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
