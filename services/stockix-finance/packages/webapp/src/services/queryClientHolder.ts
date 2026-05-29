import type { QueryClient } from 'react-query';

let queryClient: QueryClient | null = null;

export function setAppQueryClient(client: QueryClient): void {
  queryClient = client;
}

export function getAppQueryClient(): QueryClient | null {
  return queryClient;
}
