import { useClerk } from "@clerk/react";
import { ClerkProvider, SignIn, SignUp, Show } from "@clerk/react";
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";

import { SharedLayout } from "@/components/layout";
import { AuthProvider, useAppAuth } from "@/hooks/use-app-auth";

import PublicHome from "@/pages/public-home";
import Dashboard from "@/pages/dashboard";
import Portal from "@/pages/portal";
import BorrowersList from "@/pages/borrowers/list";
import BorrowerDetail from "@/pages/borrowers/detail";
import LoansList from "@/pages/loans/list";
import LoanDetail from "@/pages/loans/detail";
import NotFound from "@/pages/not-found";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(160 50% 25%)",
    colorForeground: "hsl(160 30% 15%)",
    colorMutedForeground: "hsl(160 10% 45%)",
    colorDanger: "hsl(0 70% 45%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 100%)",
    colorInputForeground: "hsl(160 30% 15%)",
    colorNeutral: "hsl(40 20% 85%)",
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: "0.35rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-xl shadow-lg border border-[hsl(40,20%,90%)] w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif font-semibold text-2xl text-[hsl(160,30%,15%)]",
    headerSubtitle: "text-[hsl(160,10%,45%)]",
    socialButtonsBlockButtonText: "text-[hsl(160,30%,15%)] font-medium",
    formFieldLabel: "text-[hsl(160,30%,15%)] font-medium text-sm",
    footerActionLink: "text-[hsl(160,50%,25%)] hover:text-[hsl(160,50%,20%)] font-medium",
    footerActionText: "text-[hsl(160,10%,45%)]",
    dividerText: "text-[hsl(160,10%,45%)]",
    identityPreviewEditButton: "text-[hsl(160,50%,25%)]",
    formFieldSuccessText: "text-emerald-600",
    alertText: "text-sm",
    logoBox: "flex justify-center mb-4",
    logoImage: "h-10",
    socialButtonsBlockButton: "border border-[hsl(40,20%,85%)] bg-white hover:bg-[hsl(40,15%,95%)]",
    formButtonPrimary: "bg-[hsl(160,50%,25%)] hover:bg-[hsl(160,50%,20%)] text-[hsl(40,33%,97%)] shadow-sm",
    formFieldInput: "border border-[hsl(40,20%,80%)] bg-white text-[hsl(160,30%,15%)] focus:ring-[hsl(160,50%,25%)]",
    footerAction: "",
    dividerLine: "bg-[hsl(40,20%,85%)]",
    alert: "border border-red-200 bg-red-50 text-red-900",
    otpCodeFieldInput: "border-[hsl(40,20%,80%)] focus:border-[hsl(160,50%,25%)]",
    formFieldRow: "space-y-4",
    main: "space-y-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 relative">
      <div className="absolute top-8 left-8">
        <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">← Back to home</Link>
      </div>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 relative">
      <div className="absolute top-8 left-8">
        <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">← Back to home</Link>
      </div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  const { role, isLoaded, isSignedIn } = useAppAuth();
  
  if (!isLoaded) return null;
  
  return (
    <>
      <Show when="signed-in">
        {role === "staff" ? <Redirect to="/dashboard" /> : <Redirect to="/portal" />}
      </Show>
      <Show when="signed-out">
        <PublicHome />
      </Show>
    </>
  );
}

function ProtectedStaffRoute({ component: Component }: { component: React.ComponentType }) {
  const { role, isLoaded, isSignedIn } = useAppAuth();
  
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (role !== "staff") return <Redirect to="/" />;
  
  return (
    <SharedLayout>
      <Component />
    </SharedLayout>
  );
}

function ProtectedBorrowerRoute({ component: Component }: { component: React.ComponentType }) {
  const { role, isLoaded, isSignedIn } = useAppAuth();
  
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (role !== "borrower") return <Redirect to="/" />;
  
  return (
    <SharedLayout>
      <Component />
    </SharedLayout>
  );
}

function ProtectedSharedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoaded, isSignedIn } = useAppAuth();
  
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  
  return (
    <SharedLayout>
      <Component />
    </SharedLayout>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Sign in to BorrowApp",
            subtitle: "Welcome back — pick up right where the ledger left off",
          },
        },
        signUp: {
          start: {
            title: "Create your BorrowApp account",
            subtitle: "Set up access to your private lending ledger",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ClerkQueryClientCacheInvalidator />
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            
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
            <Route path="/portal">
              {() => <ProtectedBorrowerRoute component={Portal} />}
            </Route>
            
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
