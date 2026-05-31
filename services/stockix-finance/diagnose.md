# Diagnostic Report: 401 Unauthorized on Auth Signin

## 1. What Guard/Middleware is Causing the 401
The 401 Unauthorized error is **NOT** caused by a global guard or middleware rejecting the request before it reaches the handler. Instead, it is thrown directly **inside the `/auth/signin` route handler** inside `AuthController` after the user's password has been successfully verified by Passport's local strategy.

## 2. Exact File and Line Number
- **File**: `services/stockix-finance/packages/server/src/modules/Auth/Auth.controller.ts`
- **Line Numbers**: Lines 121–125 (inside `signin` method).
- **Code Snippet**:
  ```typescript
  if (!organizationId || tenantId === undefined) {
    throw new UnauthorizedException(
      'No organization found for this user',
    );
  }
  ```

## 3. What Condition Triggers It
The condition that triggers the exception is `!organizationId || tenantId === undefined`. 
This occurs when:
1. The user's memberships list (fetched from the `user_tenants` table matching the authenticated user's ID) is completely empty (`memberships.length === 0`).
2. Alternatively, if `user.tenantId` is set, but no corresponding tenant is found in the `tenants` table or there is no matching membership mapping in `user_tenants` for that user-tenant combination.

When this happens, the controller fails to resolve a valid `organizationId` and `tenantId` for the user session, and immediately throws a NestJS `UnauthorizedException` which translates to a `401 Unauthorized` HTTP response. Because NestJS intercepts standard HTTP exceptions internally, it formats the error response as JSON without outputting any stack trace or error log to the server console.

## 4. What Needs to Be True for Signin to Succeed
For the signin endpoint to succeed, the following database conditions must be met:
1. The user must exist in the `users` table of the system database (`stockix_system`), and their password must be correct (verified by bcrypt).
2. The user must have a valid membership mapping in the `user_tenants` table of the system database (`stockix_system`) associating their `userId` with a valid `tenantId` and `organizationId`.
3. The referenced `tenantId` must exist in the `tenants` table of the system database (`stockix_system`).

## 5. Whether Tenant DB Needs Seeding/Initialization Before Signin Works
**No.** The `POST /api/auth/signin` endpoint itself **does not** require the tenant's individual database to be seeded or initialized to return a successful login response.
- The `AuthController` is annotated with `@PublicRoute()`, which causes the tenancy guards (`EnsureTenantIsInitializedGuard`, `EnsureTenantIsSeededGuard`, and `TenancyGlobalGuard`) to skip execution for `/signin`.
- The signin endpoint only queries system database tables (`users`, `user_tenants`, `tenants`) to validate credentials and resolve organization mappings.
- *Note*: While the signin endpoint will succeed, the user will be redirected to the setup wizard or dashboard immediately after login, which *will* then require the tenant DB to be initialized/seeded.

## 6. The Exact Fix Needed
To resolve the 401 error, you need to ensure that the user-tenant association is correctly established in the system database:
1. Insert a row in the `user_tenants` table mapping the `users.id` of the user to the `tenants.id` and `tenants.organization_id` of the provisioned tenant:
   ```sql
   INSERT INTO user_tenants (user_id, tenant_id, organization_id, role, is_active, created_at, updated_at)
   VALUES (<USER_ID>, <TENANT_ID>, '<ORGANIZATION_ID>', 'admin', 1, NOW(), NOW());
   ```
2. Ensure that the `tenantId` field on the corresponding user record in the `users` table is updated to point to the active `tenants.id`:
   ```sql
   UPDATE users SET tenant_id = <TENANT_ID> WHERE id = <USER_ID>;
   ```
