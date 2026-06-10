declare module '@bull-board/api/bullMQAdapter' {
  import type { BaseAdapter, QueueAdapterOptions } from '@bull-board/api/dist/typings/app';

  export const BullMQAdapter: new (
    queue: unknown,
    options?: Partial<QueueAdapterOptions>,
  ) => BaseAdapter;
}
