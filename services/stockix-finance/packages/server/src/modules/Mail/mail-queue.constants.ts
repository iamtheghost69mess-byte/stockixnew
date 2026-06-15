/** Default BullMQ retry policy for outbound mail jobs. */
export const MAIL_QUEUE_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
};
