// @ts-nocheck
import { transformToCamelCase } from '@/utils';
import { useRequestQuery } from '../useQueryRequest';

/**
 * Retrieve the job metadata.
 */
export function useJob(jobId, props = {}) {
  // Prevent retry storms during setup/demo polling when the backend responds 429.
  const safeRetry = (failureCount, error) => {
    const status = error?.response?.status;
    if (status === 429) return false;
    return failureCount < 2;
  };

  return useRequestQuery(
    ['JOB', jobId],
    { method: 'get', url: `organization/build/${jobId}` },
    {
      select: (res) => transformToCamelCase(res.data),
      defaultData: {},
      retry: safeRetry,
      refetchIntervalInBackground: false,
      ...props,
    },
  );
}
