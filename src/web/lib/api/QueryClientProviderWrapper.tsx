import type { FC, PropsWithChildren } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';

import { createQueryClient } from './createQueryClient';
import { useAcpSseCacheSync } from './useAcpSseCacheSync.ts';

const queryClient = createQueryClient();

const AcpSseQuerySync: FC = () => {
  useAcpSseCacheSync();
  return null;
};

export const QueryClientProviderWrapper: FC<PropsWithChildren> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <AcpSseQuerySync />
      {children}
    </QueryClientProvider>
  );
};
