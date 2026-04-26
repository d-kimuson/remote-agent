import { QueryClientProvider } from "@tanstack/react-query";
import type { FC, PropsWithChildren } from "react";
import { createQueryClient } from "./createQueryClient";

const queryClient = createQueryClient();

export const QueryClientProviderWrapper: FC<PropsWithChildren> = ({ children }) => {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
