export type ApiServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status?: number };

