/** Docker compose args for provision preflight cleanup (stale project teardown). */
export function buildPreflightDownArgs(cleanSlate = false): string[] {
  const args = ["down", "--remove-orphans", "--timeout", "10"];
  if (cleanSlate) {
    args.splice(2, 0, "-v");
  }
  return args;
}
