import { useAuth, useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { createContext, useContext, ReactNode } from "react";

type AuthContextType = {
  isLoaded: boolean;
  isSignedIn: boolean;
  role: "staff" | "borrower" | null;
  borrowerId: string | null;
};

const AuthContext = createContext<AuthContextType>({
  isLoaded: false,
  isSignedIn: false,
  role: null,
  borrowerId: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  
  const { data: me, isLoading: isMeLoading } = useGetMe({ 
    query: { 
      enabled: isClerkLoaded && !!isSignedIn, 
      queryKey: ["/api/me"],
      staleTime: 1000 * 60 * 5, // 5 mins
    } 
  });

  const isLoaded = isClerkLoaded && (isSignedIn ? !isMeLoading : true);

  return (
    <AuthContext.Provider value={{
      isLoaded,
      isSignedIn: !!isSignedIn,
      role: me?.role ?? null,
      borrowerId: me?.borrowerId ?? null
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  return useContext(AuthContext);
}
