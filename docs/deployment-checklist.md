# Stockix Deployment Checklist

## After every release with DB migrations

### 1. Apply migrations

pnpm --filter @repo/db exec drizzle-kit migrate

### 2. Verify schema (catches silent drift)

pnpm --filter @repo/db run verify-schema

If verify-schema shows ❌ for any column:

- Run the ALTER TABLE statement it prints
- Re-run verify-schema until all ✅

### 3. Restart services

# Restart API
# Restart worker

---

## API authentication reference

### From a browser session (owner dashboard)

- Log in at http://localhost:3000
- Session cookie: stockix-session (HttpOnly)

### From curl / scripts (no browser needed)

PLATFORM_API_SECRET alone now works for all routes:

  export SECRET=$(grep PLATFORM_API_SECRET .env | cut -d= -f2)
  curl -H "Authorization: Bearer $SECRET" http://localhost:4000/plans

### Named API keys (sk_live_*)

- Generate at http://localhost:3000/api-keys
- Use as: Authorization: Bearer sk_live_xxxxx
- Read-only access only
- Revocable without rotating master secret

---

## Known migration quirks

drizzle-kit migrate records migrations by file hash.
If a migration file existed on disk before being applied to
a specific DB instance, Drizzle may mark it as applied
without actually executing the SQL.

Always run verify-schema after migrate to catch this.
