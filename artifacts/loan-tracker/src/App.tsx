import React from "react";
import { Loader2 } from "lucide-react";
import { Link, Redirect, Route, Switch, Router as WouterRouter } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

import { SharedLayout } from "@/components/layout";
import { AuthProvider, useAppAuth } from "@/hooks/use-app-auth";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 bg-background">
          <div className="max-w-lg w-full rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-3">
            <p className="font-semibold text-destructive">Something went wrong</p>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </pre>
            <button
              className="text-sm underline text-muted-foreground"
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import SignIn from "@/pages/sign-in";
import Dashboard from "@/pages/dashboard";
import Portal from "@/pages/portal";
import BorrowersList from "@/pages/borrowers/list";
import BorrowerDetail from "@/pages/borrowers/detail";
import LoansList from "@/pages/loans/list";
import LoanDetail from "@/pages/loans/detail";
import LoanRequests from "@/pages/loan-requests";
import LoanRequestDetail from "@/pages/loan-requests-detail";
import EmiLoansList from "@/pages/emi-loans/list";
import EmiLoanDetail from "@/pages/emi-loans/detail";
import Recents from "@/pages/recents";
import NotFound from "@/pages/not-found";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
    </div>
  );
}

function HomeRedirect() {
  const { role, isLoaded, isSignedIn } = useAppAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return role === "staff" ? <Redirect to="/dashboard" /> : <Redirect to="/portal" />;
}

function ProtectedStaffRoute({ component: Component }: { component: React.ComponentType }) {
  const { role, isLoaded, isSignedIn } = useAppAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (role !== "staff") return <Redirect to="/portal" />;
  return (
    <SharedLayout>
      <Component />
    </SharedLayout>
  );
}

function ProtectedBorrowerRoute({ component: Component }: { component: React.ComponentType }) {
  const { role, isLoaded, isSignedIn } = useAppAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (role !== "borrower") return <Redirect to="/dashboard" />;
  return (
    <SharedLayout>
      <Component />
    </SharedLayout>
  );
}

function ProtectedSharedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoaded, isSignedIn } = useAppAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return (
    <SharedLayout>
      <Component />
    </SharedLayout>
  );
}

function SignInRoute() {
  const { isLoaded, isSignedIn, role } = useAppAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) {
    return role === "staff" ? <Redirect to="/dashboard" /> : <Redirect to="/portal" />;
  }
  return <SignIn />;
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in" component={SignInRoute} />

      <Route path="/dashboard">
        {() => <ProtectedStaffRoute component={Dashboard} />}
      </Route>
      <Route path="/borrowers">
        {() => <ProtectedStaffRoute component={BorrowersList} />}
      </Route>
      <Route path="/borrowers/:id">
        {() => <ProtectedStaffRoute component={BorrowerDetail} />}
      </Route>
      <Route path="/loans">
        {() => <ProtectedStaffRoute component={LoansList} />}
      </Route>
      <Route path="/loans/:id">
        {() => <ProtectedSharedRoute component={LoanDetail} />}
      </Route>
      <Route path="/loan-requests">
        {() => <ProtectedStaffRoute component={LoanRequests} />}
      </Route>
      <Route path="/loan-requests/:id">
        {() => <ProtectedStaffRoute component={LoanRequestDetail} />}
      </Route>
      <Route path="/recents">
        {() => <ProtectedStaffRoute component={Recents} />}
      </Route>
      <Route path="/emi-loans">
        {() => <ProtectedStaffRoute component={EmiLoansList} />}
      </Route>
      <Route path="/emi-loans/:id">
        {() => <ProtectedSharedRoute component={EmiLoanDetail} />}
      </Route>
      <Route path="/portal">
        {() => <ProtectedBorrowerRoute component={Portal} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <WouterRouter base={basePath}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Routes />
            <Toaster />
          </AuthProvider>
        </QueryClientProvider>
      </WouterRouter>
    </ErrorBoundary>
  );
}

export default App;
