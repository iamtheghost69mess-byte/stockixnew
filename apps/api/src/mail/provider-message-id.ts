/** Normalize Resend/SMTP ids for webhook correlation lookups. */
export function normalizeProviderMessageId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const bracketed = trimmed.match(/^<([^>]+)>$/);
  if (bracketed) return bracketed[1] ?? trimmed;
  return trimmed;
}

/** Candidate lookup keys for webhook → email_logs correlation. */
export function providerMessageIdCandidates(
  ...values: Array<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (!raw || typeof raw !== "string") continue;
    for (const candidate of [raw.trim(), normalizeProviderMessageId(raw)]) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}
