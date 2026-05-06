# Tenant Lifecycle Baseline Contracts

This document captures the pre-migration tenant lifecycle contracts and state transitions used to preserve compatibility during the infra-worker re-architecture.

## API routes (current contract surface)

Source: `apps/api/src/index.ts`

- `POST /tenants`
  - Creates async provisioning correlation ID.
  - Writes job state via in-memory provision job bus + DB `tenant_provision_events`.
  - Exposes status through:
    - `GET /tenants/provision-status/:correlationId`
    - `GET /tenants/provision-stream/:correlationId`
- `DELETE /tenants/:tenantId`
  - Deprovisions tenant stack and deletes tenant metadata.
- `POST /tenants/:tenantId/suspend`
  - Stops tenant compose project and marks tenant/deployment suspended.
- `POST /tenants/:tenantId/reactivate`
  - Starts tenant compose project and marks tenant/deployment active.
- `GET /tenants/:tenantId/events`
  - Returns persisted provisioning events (optionally filtered by `correlationId`).

## Tenant lifecycle states observed

Sources:
- `apps/api/src/provisioning/tenant-provision-service.ts`
- `packages/db/src/schema.ts`

Tenant status transitions:
- `provisioning` -> `active` on successful provision.
- `provisioning` -> `failed` on provisioning failure.
- `active` -> `suspended` on suspend.
- `suspended` -> `active` on reactivate.

Deployment status transitions:
- `provisioning` -> `active` / `failed`
- `active` -> `suspended`
- `suspended` -> `active`

## Provisioning side effects observed

Sources:
- `apps/api/src/provisioner.ts`
- `apps/api/src/provisioning/*`
- `apps/api/src/traefik-config.ts`

- Allocates tenant port.
- Inserts tenant + deployment rows.
- Writes tenant stack `.env`.
- Runs compose data services, migration, full stack.
- Health-checks tenant app.
- Registers bootstrap admin.
- Publishes Traefik route.
- Emits and persists trace events.

## Regression invariants to preserve

- Existing route paths stay unchanged.
- Correlation-based status and stream APIs remain available.
- Tenant/deployment status transitions stay semantically equivalent.
- Provisioning events remain persisted and queryable by tenant and correlation.
- No destructive schema changes to existing tables.
