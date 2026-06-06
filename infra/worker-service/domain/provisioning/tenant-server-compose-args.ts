/** Worker-owned migration step uses `compose run`; `--no-deps` avoids re-running migration on resume. */
export const TENANT_SERVER_UP_COMPOSE_ARGS = [
  "up",
  "-d",
  "--remove-orphans",
  "--force-recreate",
  "--no-build",
  "--no-deps",
  "server",
] as const;
