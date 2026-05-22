import type { ZodError } from "zod";

/** First error message per field key from `flatten().fieldErrors` (arrays → single string). */
export function fieldErrorsFromZodError(error: ZodError): Record<string, string> {
  const flat = error.flatten();
  const out: Record<string, string> = {};
  for (const [key, msgs] of Object.entries(flat.fieldErrors)) {
    if (msgs && msgs[0]) out[key] = msgs[0];
  }
  const form = flat.formErrors[0];
  if (form) out._form = form;
  return out;
}
