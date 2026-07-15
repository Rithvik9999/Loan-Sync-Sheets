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
    const data = await res.json();
    setState({
      isLoaded: true,
      isSignedIn: true,
      role: data.role ?? null,
      borrowerId: data.borrowerId ?? null,
      name: data.name ?? null,
      phone: data.phone ?? null,
    });
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setState({ ...defaultState, isLoaded: true });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  return useContext(AuthContext);
}
