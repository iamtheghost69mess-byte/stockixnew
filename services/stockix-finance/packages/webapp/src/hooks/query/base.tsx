// @ts-nocheck
// Query client config.
export const queryConfig = {
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 30000,
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        // 404 is a definitive client/path miss — do not hammer the server on tab focus.
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 3;
      },
    },
  },
};
