import { QueryClient, type DefaultOptions } from "@tanstack/react-query";

export const queryClientOptions: { defaultOptions: DefaultOptions } = {
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
};

export const queryClient = new QueryClient(queryClientOptions);
