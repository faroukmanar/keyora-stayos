import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useState } from 'react';
export function AppProviders({ children }: PropsWithChildren) { const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })); return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
