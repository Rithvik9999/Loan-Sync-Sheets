import { QueryClient } from "@tanstack/react-query";
import { queryClientOptions } from "./queryClient";

export const queryClient = new QueryClient(queryClientOptions);
