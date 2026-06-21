import type { ZodType } from "zod";

export function parseApiResponse<T>(schema: ZodType<T>, data: unknown, label: string): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const err = new Error(`The server returned an unexpected ${label} shape. Please retry or contact support.`);
    (err as any).raw = r.error.flatten();
    throw err;
  }
  return r.data;
}
