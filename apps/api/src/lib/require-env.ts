/** Require a non-empty env var (no silent localhost fallbacks in HTTP clients). */
export function requireEnv(name: string, example?: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    const hint = example ? ` Example: ${example}` : "";
    throw new Error(`${name} is required. Set it in .env.${hint}`);
  }
  return value;
}
