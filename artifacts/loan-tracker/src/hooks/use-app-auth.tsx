import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

export type AppRole = "staff" | "borrower";

type AuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  role: AppRole | null;
  borrowerId: string | null;
  name: string | null;
  phone: string | null;
  creditLimit: number | null;
};

type AuthContextType = AuthState & {
  login: (phone: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
};

const defaultState: AuthState = {
  isLoaded: false,
  isSignedIn: false,
  role: null,
  borrowerId: null,
  name: null,
  phone: null,
  creditLimit: null,
};

const AuthContext = createContext<AuthContextType>({
  ...defaultState,
  login: async () => {},
  logout: async () => {},
});

async function fetchMe(): Promise<AuthState> {
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) {
      return { ...defaultState, isLoaded: true };
    }
    const data = await res.json();
    return {
      isLoaded: true,
      isSignedIn: true,
      role: data.role ?? null,
      borrowerId: data.borrowerId ?? null,
      name: data.name ?? null,
      phone: data.phone ?? null,
      creditLimit: (() => {
        const v = data.creditLimit;
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && v !== "") {
          const n = parseFloat((v as string).replace(/[^0-9.-]/g, ""));
          return Number.isFinite(n) ? n : null;
        }
        return null;
      })(),
    };
  } catch {
    return { ...defaultState, isLoaded: true };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(defaultState);
  const queryClient = useQueryClient();
  const prevSignedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    fetchMe().then(setState);
  }, []);

  // Clear react-query cache on sign-in/sign-out transitions
  useEffect(() => {
    if (!state.isLoaded) return;
    if (prevSignedInRef.current !== null && prevSignedInRef.current !== state.isSignedIn) {
      queryClient.clear();
    }
    prevSignedInRef.current = state.isSignedIn;
  }, [state.isSignedIn, state.isLoaded, queryClient]);

  const login = useCallback(async (phone: string, pin: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, pin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      const msg = typeof err?.error === "string" ? err.error : "Login failed. Please try again.";
      throw new Error(msg || "Invalid phone number or PIN");
    }
    // Always wipe the React Query cache before loading the new user's data.
    // The effect-based clear only fires on isSignedIn transitions (false→true /
    // true→false). If a user logs in while another session is still active
    // (isSignedIn stays true throughout), the effect never fires and the
    // previous user's data would remain visible — explicit clear prevents that.
    queryClient.clear();
    // Fetch /me after login so creditLimit (and any other borrower-only fields)
    // are populated — the login endpoint only returns basic identity.
    const fullState = await fetchMe();
    setState(fullState);
  }, [queryClient]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    // Clear synchronously before state update so no cached data is readable
    // even during the brief React render between setState and the effect firing.
    queryClient.clear();
    setState({ ...defaultState, isLoaded: true });
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  return useContext(AuthContext);
}
