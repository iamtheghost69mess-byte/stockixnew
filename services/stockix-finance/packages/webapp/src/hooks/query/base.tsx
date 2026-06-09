// @ts-nocheck
// Query client config.
export const queryConfig = {
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30000,
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        // Do not retry auth failures, rate limits, or server errors — avoids request storms.
        if (
          status === 401
          || status === 403
          || status === 404
          || status === 429
          || (status != null && status >= 500)
        ) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
};
