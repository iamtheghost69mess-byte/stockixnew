#!/usr/bin/env python3
"""Generate docs/openapi/stockix-platform.openapi.yaml from monorepo route inventory."""
from __future__ import annotations

import pathlib
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "openapi" / "stockix-platform.openapi.yaml"

RBAC = "x-stockix-min-role"


def rbac(role: str) -> dict:
    return {RBAC: role}


def err(*codes: int) -> dict:
    return {str(c): {"description": f"HTTP {c}"} for c in codes}


def json_body(schema: dict, required: bool = True) -> dict:
    return {
        "required": required,
        "content": {"application/json": {"schema": schema}},
    }


def ref(name: str) -> dict:
    return {"$ref": f"#/components/schemas/{name}"}


def param(name: str, where: str = "path", **schema) -> dict:
    p = {"name": name, "in": where, "required": where == "path", "schema": schema}
    return p


def param_ref(name: str) -> dict:
    return {"$ref": f"#/components/parameters/{name}"}


def op(
    method: str,
    tag: str,
    summary: str,
    *,
    description: str = "",
    security=None,
    parameters=None,
    request_body=None,
    responses=None,
    servers=None,
    extra=None,
):
    o = {"tags": [tag], "summary": summary}
    if description:
        o["description"] = description.strip()
    if security is not None:
        o["security"] = security
    if parameters:
        o["parameters"] = parameters
    if request_body:
        o["requestBody"] = request_body
    o["responses"] = responses or err(200)
    if servers:
        o["servers"] = servers
    if extra:
        o.update(extra)
    return {method: o}


def cp(*args, **kwargs):
    return op(*args, **kwargs)


def pms(*args, **kwargs):
    kwargs.setdefault(
        "servers", [{"url": "http://localhost:3003", "description": "PMS service"}]
    )
    kwargs.setdefault("security", [{"PmsProductJwt": []}, {"PmsInternalBypass": []}])
    return op(*args, **kwargs)


spec: dict = {
    "openapi": "3.1.0",
    "jsonSchemaDialect": "https://spec.openapis.org/oas/3.1/dialect/base",
    "info": {
        "title": "Stockix Platform APIs",
        "version": "1.0.0",
        "description": (
            "OpenAPI 3.1 derived from Stockix monorepo backend source. "
            "Only documents routes present in code.\n\n"
            "| Service | Base URL | Coverage |\n"
            "|---|---|---|\n"
            "| Control Plane | http://localhost:4000 | This file (full) |\n"
            "| PMS | http://localhost:3003 | This file (full) |\n"
            "| Finance | https://{tenant}.stockix.cloud/api | NOT PROVIDED — "
            "services/stockix-finance/shared/sdk-ts/openapi.json or /swagger |\n"
            "| POS Tenant | http://localhost:8010 | NOT PROVIDED — "
            "services/posnew/apps/pos-backend/openapi/tenant-pos-v1.yaml |\n"
            "| POS Platform | http://localhost:8010/api/platform/v1 | NOT PROVIDED — "
            "services/posnew/apps/pos-backend/openapi/platform-v1.yaml |\n"
            "| Chatlive | CHATWOOT_BASE_URL | NOT PROVIDED — "
            "services/chatlive/swagger/swagger.json |\n\n"
            "RBAC rank: read_only < support_agent < billing_manager < super_admin.\n"
            "Dedicated license suspend endpoint: NOT PROVIDED (use revoke or tenant suspend)."
        ),
    },
    "servers": [
        {"url": "http://localhost:4000", "description": "Stockix Control Plane API"},
        {"url": "http://localhost:3003", "description": "PMS service"},
    ],
    "tags": [
        {"name": "CP-Health"},
        {"name": "CP-Public"},
        {"name": "CP-Auth"},
        {"name": "CP-Internal"},
        {"name": "CP-Owners"},
        {"name": "CP-API-Keys"},
        {"name": "CP-Tenants"},
        {"name": "CP-Organizations"},
        {"name": "CP-Finance-Users"},
        {"name": "CP-POS-Proxy"},
        {"name": "CP-POS-Credentials"},
        {"name": "CP-PMS-Proxy"},
        {"name": "CP-Plans"},
        {"name": "CP-Licenses"},
        {"name": "CP-Fingerprints"},
        {"name": "CP-Audit"},
        {"name": "CP-Search"},
        {"name": "PMS-Properties"},
        {"name": "PMS-Rooms"},
        {"name": "PMS-Bookings"},
        {"name": "PMS-Guests"},
        {"name": "PMS-Payments"},
        {"name": "PMS-Channels"},
        {"name": "PMS-Cleaning"},
        {"name": "PMS-Staff"},
        {"name": "PMS-Reports"},
        {"name": "PMS-Calendar"},
        {"name": "PMS-Templates"},
        {"name": "PMS-DateOverrides"},
        {"name": "PMS-Public"},
    ],
    "security": [{"SessionCookie": []}, {"BearerSession": []}, {"PlatformApiSecret": []}],
    "paths": {},
    "components": {
        "securitySchemes": {
            "SessionCookie": {
                "type": "apiKey",
                "in": "cookie",
                "name": "stockix-session",
                "description": "Owner dashboard HttpOnly session cookie.",
            },
            "BearerSession": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "Owner session JWT.",
            },
            "PlatformApiSecret": {
                "type": "http",
                "scheme": "bearer",
                "description": "Bearer PLATFORM_API_SECRET.",
            },
            "ApiKeyAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "sk_live_",
                "description": "Read-only platform API key.",
            },
            "WorkerSecret": {
                "type": "http",
                "scheme": "bearer",
                "description": "Bearer WORKER_SECRET for internal worker routes.",
            },
            "PmsProductJwt": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "Product JWT (AUTH_TOKEN_SECRET, module pms).",
            },
            "PmsInternalBypass": {
                "type": "apiKey",
                "in": "header",
                "name": "x-stockix-tenant-id",
                "description": "UUID tenant; pair with x-stockix-internal-secret = PLATFORM_API_SECRET.",
            },
        },
        "parameters": {
            "TenantIdPath": param("tenantId", format="uuid"),
            "LicenseIdPath": param("licenseId", format="uuid"),
            "PlanIdPath": param("planId", format="uuid"),
            "CorrelationIdPath": param("correlationId", format="uuid"),
            "OwnerIdPath": param("ownerId", format="uuid"),
            "OrgIdPath": param("orgId", format="uuid"),
            "JobIdPath": param("jobId", format="uuid"),
            "IdempotencyKey": {
                "name": "Idempotency-Key",
                "in": "header",
                "required": True,
                "schema": {"type": "string", "minLength": 1},
                "description": "Required for POST/PATCH/DELETE on /owners/* and /tenants/*.",
            },
        },
        "schemas": {
            "Error": {
                "type": "object",
                "properties": {
                    "error": {"type": "string"},
                    "message": {"type": "string"},
                    "detail": {"type": "object", "additionalProperties": True},
                },
            },
            "OwnerRole": {
                "type": "string",
                "enum": ["read_only", "support_agent", "billing_manager", "super_admin"],
            },
            "StockixModule": {
                "type": "string",
                "enum": ["accounting", "pos", "pms", "chat"],
            },
            "LicenseProduct": {
                "type": "string",
                "enum": ["platform", "pos_desktop", "bundle"],
            },
            "LicenseModule": {
                "type": "string",
                "enum": ["accounting", "pos", "pms", "chat"],
            },
            "LicenseStatus": {
                "type": "string",
                "enum": ["unassigned", "active", "revoked", "expired"],
            },
            "Plan": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "format": "uuid"},
                    "name": {"type": "string"},
                    "slug": {"type": "string"},
                    "maxOrganizations": {"type": "integer"},
                    "maxActivations": {"type": "integer"},
                    "maxUsers": {"type": "integer"},
                    "isActive": {"type": "boolean"},
                    "features": {"type": "array", "items": {"type": "string"}},
                },
            },
            "LicenseSummary": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "format": "uuid"},
                    "licenseKey": {"type": "string"},
                    "product": ref("LicenseProduct"),
                    "planSlug": {"type": "string"},
                    "status": ref("LicenseStatus"),
                    "tenantId": {"type": "string", "format": "uuid", "nullable": True},
                    "maxActivations": {"type": "integer"},
                    "activationCount": {"type": "integer"},
                    "isPerpetual": {"type": "boolean"},
                    "expiresAt": {"type": "string", "format": "date-time", "nullable": True},
                    "modules": {"type": "array", "items": ref("LicenseModule")},
                },
            },
            "ProvisionTenantRequest": {
                "type": "object",
                "required": [
                    "slug",
                    "name",
                    "owner_id",
                    "admin_email",
                    "admin_first_name",
                    "admin_last_name",
                ],
                "properties": {
                    "slug": {"type": "string", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$"},
                    "name": {"type": "string"},
                    "owner_id": {"type": "string", "format": "uuid"},
                    "admin_email": {"type": "string", "format": "email"},
                    "admin_first_name": {"type": "string"},
                    "admin_last_name": {"type": "string"},
                    "plan_slug": {"type": "string", "default": "starter"},
                    "modules": {
                        "type": "array",
                        "items": ref("StockixModule"),
                        "default": ["accounting"],
                    },
                    "assign_existing_license_id": {"type": "string", "format": "uuid"},
                },
            },
            "ActivateLicenseRequest": {
                "type": "object",
                "required": ["licenseKey", "hardwareFingerprint"],
                "properties": {
                    "licenseKey": {"type": "string"},
                    "hardwareFingerprint": {"type": "string", "minLength": 8, "maxLength": 256},
                    "machineName": {"type": "string", "maxLength": 120},
                },
            },
            "OkResponse": {"type": "object", "properties": {"ok": {"type": "boolean"}}},
        },
    },
}

P = spec["paths"]


def add(path: str, operations: dict):
    P[path] = {**P.get(path, {}), **operations}


# Health & public
add(
    "/health",
    cp(
        "get",
        "CP-Health",
        "Liveness probe",
        security=[],
        responses={
            "200": {
                "description": "Service healthy",
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "status": {"type": "string", "enum": ["ok"]},
                                "service": {"type": "string"},
                                "timestamp": {"type": "string", "format": "date-time"},
                            },
                        }
                    }
                },
            }
        },
    ),
)

add(
    "/public/tenant-orgs/{tenantId}",
    cp(
        "get",
        "CP-Public",
        "List active organizations (public)",
        security=[],
        parameters=[param_ref("TenantIdPath")],
        description="No auth. Returns publicUrl per org for onboarding UIs.",
        responses=err(200, 400, 503),
    ),
)

# Auth
AUTH_DESC = (
    "Public auth surface. Mutating routes enforce CSRF via Origin header unless Authorization is present. "
    "Rate limits apply to login, MFA verify, invite accept, password reset."
)
for m, path, summary in [
    ("post", "/auth/session/validate", "Validate session"),
    ("post", "/auth/login", "Owner login"),
    ("post", "/auth/mfa/begin", "Begin MFA setup"),
    ("post", "/auth/mfa/enable", "Enable MFA"),
    ("post", "/auth/mfa/disable", "Disable MFA"),
    ("get", "/auth/mfa/status", "MFA status"),
    ("post", "/auth/reconfirm", "Reconfirm password"),
    ("post", "/auth/verify-mfa", "Complete MFA login"),
    ("get", "/auth/me", "Current owner"),
    ("post", "/auth/logout", "Logout"),
    ("get", "/auth/invite/{token}", "Invite metadata"),
    ("post", "/auth/invite/accept", "Accept invite"),
    ("post", "/auth/password/forgot", "Forgot password"),
    ("post", "/auth/password/reset", "Reset password"),
]:
    add(path, cp("post" if m == "post" else m, "CP-Auth", summary, security=[], description=AUTH_DESC, responses=err(200, 400, 401, 403, 429)))

# Plans
add(
    "/plans",
    {
        **cp(
            "get",
            "CP-Plans",
            "List plans",
            extra=rbac("read_only"),
            responses={
                "200": {
                    "description": "Plan catalog",
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "plans": {"type": "array", "items": ref("Plan")}
                                },
                            }
                        }
                    },
                }
            },
        ),
        **cp(
            "post",
            "CP-Plans",
            "Create plan",
            extra=rbac("super_admin"),
            request_body=json_body(
                {
                    "type": "object",
                    "required": ["name", "slug"],
                    "properties": {
                        "name": {"type": "string", "minLength": 2, "maxLength": 100},
                        "slug": {"type": "string"},
                        "maxOrganizations": {"type": "integer", "default": 1},
                        "maxActivations": {"type": "integer", "default": 1},
                        "maxUsers": {"type": "integer", "default": 999},
                        "isPerpetual": {"type": "boolean"},
                        "features": {"type": "array", "items": {"type": "string"}},
                    },
                }
            ),
            description="409 SLUG_EXISTS if slug taken. Cannot deactivate plan with active licenses (DELETE).",
            responses=err(201, 400, 409),
        ),
    },
)

add(
    "/plans/{planId}",
    {
        **cp(
            "patch",
            "CP-Plans",
            "Update plan",
            parameters=[param_ref("PlanIdPath")],
            extra=rbac("super_admin"),
            responses=err(200, 400, 404),
        ),
        **cp(
            "delete",
            "CP-Plans",
            "Deactivate plan",
            parameters=[param_ref("PlanIdPath")],
            extra=rbac("super_admin"),
            description="Soft delete (isActive=false). 409 PLAN_IN_USE.",
            responses=err(200, 404, 409),
        ),
    },
)

# Licenses
add(
    "/licenses/generate",
    cp(
        "post",
        "CP-Licenses",
        "Generate license keys",
        extra=rbac("super_admin"),
        request_body=json_body(
            {
                "type": "object",
                "required": ["product", "planSlug"],
                "properties": {
                    "product": ref("LicenseProduct"),
                    "modules": {"type": "array", "items": ref("LicenseModule")},
                    "planSlug": {"type": "string"},
                    "count": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1},
                    "isPerpetual": {"type": "boolean", "default": True},
                    "expiresAt": {"type": "string", "format": "date-time"},
                    "validFrom": {"type": "string", "format": "date-time"},
                    "maxActivations": {"type": "integer", "minimum": 1, "maximum": 50},
                    "gracePeriodDays": {"type": "integer", "minimum": 0, "maximum": 365, "default": 7},
                    "notes": {"type": "string", "maxLength": 500},
                    "tenantId": {"type": "string", "format": "uuid"},
                },
            }
        ),
        description=(
            "If tenantId set, licenses are active immediately and tenant planSlug updated. "
            "expiresAt required when isPerpetual=false."
        ),
        responses=err(201, 400, 404),
    ),
)

add(
    "/licenses",
    cp(
        "get",
        "CP-Licenses",
        "List licenses",
        extra=rbac("read_only"),
        parameters=[
            param("status", "query", type="string"),
            param("product", "query", type="string"),
            param("planSlug", "query", type="string"),
            param("tenantId", "query", type="string", format="uuid"),
            param("primary", "query", type="string", description="With tenantId returns canonical license"),
            param("expiringInDays", "query", type="integer"),
            param("search", "query", type="string"),
            param("page", "query", type="integer", default=1),
            param("pageSize", "query", type="integer", default=20),
        ],
        responses={
            "200": {
                "description": "Paginated licenses",
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "licenses": {"type": "array", "items": ref("LicenseSummary")},
                                "total": {"type": "integer"},
                                "page": {"type": "integer"},
                                "pageSize": {"type": "integer"},
                            },
                        }
                    }
                },
            }
        },
    ),
)

add(
    "/licenses/analytics",
    cp("get", "CP-Licenses", "License analytics", extra=rbac("read_only"), responses=err(200)),
)

add(
    "/licenses/export.csv",
    cp(
        "get",
        "CP-Licenses",
        "Export licenses CSV",
        extra=rbac("read_only"),
        responses={"200": {"description": "text/csv attachment"}},
    ),
)

add(
    "/licenses/activate",
    cp(
        "post",
        "CP-Licenses",
        "Activate license on device",
        security=[],
        request_body=json_body(ref("ActivateLicenseRequest")),
        description=(
            "Public. Edge cases: device_blacklisted, license_not_assigned, max_activations_reached, "
            "license_not_yet_valid, license_revoked, license_expired."
        ),
        responses=err(200, 400, 403, 404),
     ),
)

add(
    "/licenses/verify-offline",
    cp(
        "post",
        "CP-Licenses",
        "Verify offline token",
        security=[],
        request_body=json_body(
            {
                "type": "object",
                "required": ["offlineToken", "hardwareFingerprint"],
                "properties": {
                    "offlineToken": {"type": "string"},
                    "hardwareFingerprint": {"type": "string"},
                },
            }
        ),
        responses=err(200, 401, 403, 404),
    ),
)

for suffix, method, summary, role, desc in [
    ("/licenses/{licenseId}", "get", "License detail", "read_only", ""),
    ("/licenses/{licenseId}/history", "get", "License audit history", "read_only", "Paginated page/pageSize max 100"),
    ("/licenses/sync-audit/{tenantId}", "get", "Finance sync audit preview", "super_admin", ""),
    ("/licenses/{licenseId}", "patch", "Update license notes", "billing_manager", "notes max 2000"),
    ("/licenses/{licenseId}/extend", "post", "Extend license expiry", "billing_manager", "409 cannot_extend_revoked"),
    ("/licenses/{licenseId}/assign", "post", "Assign license to tenant", "super_admin", "409 license_already_assigned"),
    ("/licenses/{licenseId}/revoke", "post", "Revoke license", "super_admin", "Deactivates devices; triggers Finance+POS sync"),
    (
        "/licenses/{licenseId}/activations/{activationId}/deactivate",
        "post",
        "Deactivate device activation",
        "support_agent",
        "",
    ),
]:
    params = [param_ref("LicenseIdPath")]
    if "{activationId}" in suffix:
        params.append(param("activationId", format="uuid"))
    if "{tenantId}" in suffix:
        params = [param_ref("TenantIdPath")]
    add(
        suffix,
        cp(
            method,
            "CP-Licenses",
            summary,
            parameters=params,
            extra=rbac(role),
            description=desc,
            responses=err(200, 400, 404, 409),
        ),
    )

add(
    "/fingerprints/blacklist",
    cp(
        "post",
        "CP-Fingerprints",
        "Blacklist hardware fingerprint",
        extra=rbac("super_admin"),
        request_body=json_body(
            {
                "type": "object",
                "required": ["hardwareFingerprint"],
                "properties": {
                    "hardwareFingerprint": {"type": "string"},
                    "reason": {"type": "string"},
                },
            }
        ),
        responses=err(200, 400),
    ),
)

# Tenants
add(
    "/tenants",
    {
        **cp("get", "CP-Tenants", "List tenants", extra=rbac("read_only"), responses=err(200)),
        **cp(
            "post",
            "CP-Tenants",
            "Provision tenant (async)",
            extra=rbac("super_admin"),
            parameters=[param_ref("IdempotencyKey")],
            request_body=json_body(ref("ProvisionTenantRequest")),
            description="202 accepted. Poll /tenants/provision-status/{correlationId}.",
            responses=err(202, 400, 409),
        ),
    },
)

add("/tenants/export.csv", cp("get", "CP-Tenants", "Export tenants CSV", extra=rbac("read_only"), responses={"200": {"description": "CSV"}}))

for path, method, summary, role in [
    ("/tenants/provision-status/{correlationId}", "get", "Poll provision status", "support_agent"),
    ("/tenants/provision-stream/{correlationId}", "get", "SSE provision stream", "support_agent"),
    ("/tenants/provision-stop/{correlationId}", "post", "Stop provision by correlation", "support_agent"),
    ("/tenants/{tenantId}/provision-stop", "post", "Stop provision for tenant", "support_agent"),
    ("/tenants/{tenantId}", "get", "Tenant detail", "read_only"),
    ("/tenants/{tenantId}", "patch", "Update tenant", "super_admin"),
    ("/tenants/{tenantId}", "delete", "Delete tenant", "super_admin"),
    ("/tenants/{tenantId}/retry-provision", "post", "Retry provision", "support_agent"),
    ("/tenants/{tenantId}/suspend", "post", "Suspend tenant", "super_admin"),
    ("/tenants/{tenantId}/reactivate", "post", "Reactivate tenant", "super_admin"),
    ("/tenants/{tenantId}/stop", "post", "Stop tenant stacks", "super_admin"),
    ("/tenants/{tenantId}/impersonate", "post", "Issue impersonation token", "super_admin"),
    ("/tenants/{tenantId}/events", "get", "Provisioning events", "read_only"),
    ("/tenants/{tenantId}/add-module", "post", "Add module to tenant", "super_admin"),
    ("/tenants/{tenantId}/remove-module", "post", "Remove module from tenant", "super_admin"),
    ("/tenants/{tenantId}/repair-finance-link", "post", "Repair Finance tenant link", "support_agent"),
    ("/tenants/{tenantId}/finance-password", "delete", "Clear finance password cache", "support_agent"),
]:
    params = []
    if "{tenantId}" in path:
        params.append(param_ref("TenantIdPath"))
    if "{correlationId}" in path:
        params.append(param_ref("CorrelationIdPath"))
    idem = [param_ref("IdempotencyKey")] if method in ("post", "patch", "delete") and "/tenants" in path and "provision-stop" not in path and "add-module" not in path and "remove-module" not in path and "retry" not in path and "suspend" not in path and "reactivate" not in path and "stop" not in path and "impersonate" not in path and "repair" not in path else []
    add(path, cp(method, "CP-Tenants", summary, parameters=params + idem, extra=rbac(role), responses=err(200, 202, 400, 404, 409, 503)))

# Organizations under tenant
for path, method, summary, role in [
    ("/tenants/{tenantId}/organizations", "get", "List organizations", "read_only"),
    ("/tenants/{tenantId}/organizations", "post", "Create organization", "support_agent"),
    ("/tenants/{tenantId}/organizations/{orgId}", "get", "Get organization", "read_only"),
    ("/tenants/{tenantId}/organizations/{orgId}", "patch", "Update organization", "support_agent"),
    ("/tenants/{tenantId}/organizations/{orgId}", "delete", "Delete organization", "support_agent"),
    ("/tenants/{tenantId}/organization-access", "get", "List support org access grants", "super_admin"),
    ("/tenants/{tenantId}/organization-access", "post", "Grant support org access", "super_admin"),
    ("/tenants/{tenantId}/organization-access/{accessId}", "delete", "Revoke support org access", "super_admin"),
]:
    params = [param_ref("TenantIdPath")]
    if "{orgId}" in path:
        params.append(param_ref("OrgIdPath"))
    if "{accessId}" in path:
        params.append(param("accessId", format="uuid"))
    add(path, cp(method, "CP-Organizations", summary, parameters=params, extra=rbac(role), responses=err(200, 201, 400, 404, 409)))

# Finance users proxy
for path, method, summary in [
    ("/tenants/{tenantId}/users", "get", "List Finance users"),
    ("/tenants/{tenantId}/users/invite", "post", "Invite Finance user"),
    ("/tenants/{tenantId}/users", "post", "Create Finance user"),
    ("/tenants/{tenantId}/users/{userId}", "patch", "Update Finance user"),
    ("/tenants/{tenantId}/users/{userId}", "delete", "Delete Finance user"),
    ("/tenants/{tenantId}/users/{userId}/reset-password", "post", "Reset Finance user password"),
    ("/tenants/{tenantId}/users/{userId}/suspend", "post", "Suspend Finance user"),
    ("/tenants/{tenantId}/users/{userId}/activate", "post", "Activate Finance user"),
]:
    role = "read_only" if method == "get" else "support_agent"
    params = [param_ref("TenantIdPath")]
    if "{userId}" in path:
        params.append(param("userId", type="integer", minimum=1))
    add(
        path,
        cp(
            method,
            "CP-Finance-Users",
            summary,
            parameters=params,
            extra=rbac(role),
            description="Proxies Finance internal API. 503 finance_tenant_not_linked if deployment unlinked.",
            responses=err(200, 201, 400, 404, 502, 503),
        ),
    )

# POS credentials
add(
    "/tenants/{tenantId}/pos-credentials",
    cp(
        "get",
        "CP-POS-Credentials",
        "Reveal POS role PINs",
        parameters=[param_ref("TenantIdPath")],
        extra=rbac("support_agent"),
        description="Proxies GET /api/platform/v1/organizations/{id}/credentials. Audited.",
        responses=err(200, 403, 404, 502),
    ),
)
add(
    "/tenants/{tenantId}/pos-credentials/reset-pin",
    cp(
        "post",
        "CP-POS-Credentials",
        "Reset POS PIN for role",
        parameters=[param_ref("TenantIdPath")],
        extra=rbac("support_agent"),
        request_body=json_body(
            {"type": "object", "required": ["role"], "properties": {"role": {"type": "string"}}}
        ),
        responses=err(200, 400, 403, 404, 502),
    ),
)

# POS proxy (control plane)
for path, method, summary in [
    ("/pos/tenant-org", "get", "Resolve POS org by Stockix tenant"),
    ("/pos/organizations", "get", "List POS organizations"),
    ("/pos/organizations", "post", "Create POS organization"),
    ("/pos/organizations/{id}", "get", "Get POS organization"),
    ("/pos/organizations/{id}", "patch", "Update POS organization"),
    ("/pos/devices", "get", "List POS devices"),
    ("/pos/devices/{id}/approve", "post", "Approve POS device"),
    ("/pos/devices/{id}", "delete", "Delete POS device"),
    ("/pos/metrics/summary", "get", "POS metrics summary"),
    ("/pos/metrics/kpis", "get", "POS KPI metrics"),
    ("/pos/flags", "get", "List feature flags"),
    ("/pos/flags/{key}", "patch", "Update feature flag"),
    ("/pos/webhooks", "get", "List webhook config"),
    ("/pos/notifications", "get", "List notifications"),
    ("/pos/jobs", "get", "List platform jobs"),
    ("/pos/audits", "get", "POS audit log"),
    ("/pos/compliance/export", "get", "Compliance export"),
    ("/pos/status", "get", "POS platform status"),
]:
    role = "super_admin" if method in ("post", "patch", "delete") else "read_only"
    params = [param("id")] if "{id}" in path else []
    if "{key}" in path:
        params = [param("key")]
    add(
        path,
        cp(
            method,
            "CP-POS-Proxy",
            summary,
            parameters=params,
            extra=rbac(role),
            description="Transparent proxy to POS Platform API (/api/platform/v1). Response shape: NOT PROVIDED (see platform-v1.yaml).",
            responses=err(200, 502),
        ),
    )

# PMS proxy
add("/pms/status", cp("get", "CP-PMS-Proxy", "PMS proxy configuration", extra=rbac("read_only"), responses=err(200)))
add("/pms/health", cp("get", "CP-PMS-Proxy", "PMS health via proxy", extra=rbac("read_only"), responses=err(200)))
add(
    "/pms/api/{path}",
    cp(
        "get",
        "CP-PMS-Proxy",
        "Wildcard PMS API proxy",
        parameters=[param("path")],
        extra=rbac("read_only"),
        description="Forwards to PMS /api/* with x-stockix-internal-secret and x-stockix-tenant-id query tenantId.",
        responses=err(200, 502),
    ),
)

# Owners & admin
add("/owners", {**cp("get", "CP-Owners", "List owners", extra=rbac("read_only"), responses=err(200)), **cp("post", "CP-Owners", "Create owner", extra=rbac("super_admin"), parameters=[param_ref("IdempotencyKey")], responses=err(201, 400, 409))})
add("/owners/invite", cp("post", "CP-Owners", "Invite owner", extra=rbac("super_admin"), parameters=[param_ref("IdempotencyKey")], responses=err(200, 400, 409)))
add(
    "/owners/{ownerId}",
    {
        **cp(
            "patch",
            "CP-Owners",
            "Update owner",
            parameters=[param_ref("OwnerIdPath"), param_ref("IdempotencyKey")],
            extra=rbac("super_admin"),
            responses=err(200, 400, 403, 404),
        ),
        **cp(
            "delete",
            "CP-Owners",
            "Delete owner",
            parameters=[param_ref("OwnerIdPath"), param_ref("IdempotencyKey")],
            extra=rbac("super_admin"),
            responses=err(200, 403, 404),
        ),
    },
)

add("/api-keys", {**cp("get", "CP-API-Keys", "List API keys", extra=rbac("super_admin"), responses=err(200)), **cp("post", "CP-API-Keys", "Create API key", extra=rbac("super_admin"), description="403 if authenticated via API key. rawKey returned once.", responses=err(201, 400, 403))})
add("/api-keys/{keyId}", cp("delete", "CP-API-Keys", "Revoke API key", parameters=[param("keyId", format="uuid")], extra=rbac("super_admin"), responses=err(200, 403, 404)))

add("/audit-log", cp("get", "CP-Audit", "List admin audit log", extra=rbac("super_admin"), responses=err(200)))
add("/admin/orphan-check", cp("get", "CP-Audit", "Orphan resource check", extra=rbac("super_admin"), responses=err(200)))
add("/search", cp("get", "CP-Search", "Global search", extra=rbac("read_only"), parameters=[param("q", "query", type="string")], responses=err(200)))

# Internal worker
for path, method, summary in [
    ("/internal/jobs/claim", "post", "Claim next job"),
    ("/internal/jobs/{jobId}/heartbeat", "post", "Job heartbeat"),
    ("/internal/jobs/{jobId}/cancel-check", "get", "Check cancel flag"),
    ("/internal/jobs/{jobId}/complete", "post", "Complete job"),
    ("/internal/jobs/{jobId}/fail", "post", "Fail job"),
    ("/internal/jobs/dead", "get", "List dead jobs"),
    ("/internal/jobs/{jobId}/requeue", "post", "Requeue dead job"),
    ("/internal/organizations/{controlPlaneOrgId}", "patch", "Patch organization from worker"),
]:
    params = [param_ref("JobIdPath")] if "{jobId}" in path else []
    if "controlPlaneOrgId" in path:
        params = [param("controlPlaneOrgId", format="uuid")]
    add(
        path,
        cp(
            method,
            "CP-Internal",
            summary,
            security=[{"WorkerSecret": []}],
            parameters=params,
            responses=err(200, 400, 401),
        ),
    )

# --- PMS service paths ---
def pms_crud(base: str, tag: str, name: str):
    add(
        base,
        {
            **pms("get", tag, f"List {name}s", responses=err(200, 503)),
            **pms("post", tag, f"Create {name}", responses=err(201, 400, 503)),
        },
    )
    add(
        f"{base}/{{id}}",
        {
            **pms("get", tag, f"Get {name}", parameters=[param("id", format="uuid")], responses=err(200, 404, 503)),
            **pms("patch", tag, f"Update {name}", parameters=[param("id", format="uuid")], responses=err(200, 404, 503)),
            **pms("delete", tag, f"Delete {name}", parameters=[param("id", format="uuid")], responses=err(200, 404, 503)),
        },
    )


pms_crud("/api/properties", "PMS-Properties", "property")
pms_crud("/api/rooms", "PMS-Rooms", "room")
pms_crud("/api/guests", "PMS-Guests", "guest")

add(
    "/api/bookings",
    {
        **pms(
            "get",
            "PMS-Bookings",
            "List bookings",
            parameters=[
                param("propertyId", "query", type="string", format="uuid"),
                param("status", "query", type="string"),
            ],
            responses=err(200, 503),
        ),
        **pms("post", "PMS-Bookings", "Create booking", responses=err(201, 400, 503)),
    },
)
add(
    "/api/bookings/{id}",
    {
        **pms("get", "PMS-Bookings", "Get booking", parameters=[param("id", format="uuid")], responses=err(200, 404)),
        **pms("patch", "PMS-Bookings", "Update booking", parameters=[param("id", format="uuid")], responses=err(200, 404)),
    },
)
for action in ["check-in", "check-out", "cancel"]:
    add(
        f"/api/bookings/{{id}}/{action}",
        pms(
            "post",
            "PMS-Bookings",
            f"Booking {action}",
            parameters=[param("id", format="uuid")],
            description="check-out sets room cleaning and syncs Finance receipt (async).",
            responses=err(200, 404, 503),
        ),
    )

add(
    "/api/payments",
    {
        **pms(
            "get",
            "PMS-Payments",
            "List payments",
            parameters=[param("bookingId", "query", type="string", format="uuid")],
            responses=err(200),
        ),
        **pms("post", "PMS-Payments", "Record payment", responses=err(201, 400)),
    },
)
add(
    "/api/payments/{id}",
    pms("get", "PMS-Payments", "Get payment", parameters=[param("id", format="uuid")], responses=err(200, 404)),
)

# Channels
add("/api/channels", {**pms("get", "PMS-Channels", "List iCal channels", responses=err(200)), **pms("post", "PMS-Channels", "Create channel", responses=err(201))})
add("/api/channels/{id}", {**pms("patch", "PMS-Channels", "Update channel", parameters=[param("id", format="uuid")], responses=err(200, 404)), **pms("delete", "PMS-Channels", "Delete channel", parameters=[param("id", format="uuid")], responses=err(200))})
add("/api/channels/sync", pms("post", "PMS-Channels", "Trigger calendar sync", responses=err(200)))
add("/api/channels/logs", pms("get", "PMS-Channels", "Sync audit logs", parameters=[param("limit", "query", type="integer")], responses=err(200)))

# Cleaning
for sub, ops in [
    ("/api/cleaning/tasks", [("get", "List tasks"), ("post", "Create task"), ("patch", "Update task")]),
    ("/api/cleaning/cleaners", [("get", "List cleaners"), ("post", "Create cleaner"), ("patch", "Update cleaner"), ("delete", "Delete cleaner")]),
    ("/api/cleaning/assignments", [("get", "List assignments"), ("post", "Create assignment"), ("delete", "Delete assignment")]),
]:
    for method, summary in ops:
        path = sub if method != "patch" else f"{sub}/{{id}}"
        if method == "patch":
            add(path, pms("patch", "PMS-Cleaning", summary, parameters=[param("id", format="uuid")], responses=err(200, 404)))
        elif method == "delete":
            add(f"{sub}/{{id}}", pms("delete", "PMS-Cleaning", summary, parameters=[param("id", format="uuid")], responses=err(200)))
        else:
            add(sub if method == "get" or method == "post" else sub, pms(method, "PMS-Cleaning", summary, responses=err(200 if method == "get" else 201)))

# Staff
add("/api/staff", {**pms("get", "PMS-Staff", "List staff", responses=err(200)), **pms("post", "PMS-Staff", "Create staff", responses=err(201))})
add("/api/staff/{id}", pms("delete", "PMS-Staff", "Delete staff", parameters=[param("id", format="uuid")], responses=err(200)))
add("/api/staff/managers", {**pms("get", "PMS-Staff", "List property managers", responses=err(200)), **pms("post", "PMS-Staff", "Assign property manager", responses=err(201))})
add("/api/staff/managers/{id}", pms("delete", "PMS-Staff", "Remove property manager", parameters=[param("id", format="uuid")], responses=err(200)))
add("/api/staff/invites", {**pms("get", "PMS-Staff", "List invites", responses=err(200)), **pms("post", "PMS-Staff", "Create invite", responses=err(201))})
add("/api/staff/invites/{token}/accept", pms("post", "PMS-Staff", "Accept staff invite", parameters=[param("token")], description="409 if revoked/expired/already accepted.", responses=err(200, 400, 404, 409)))
add("/api/staff/invites/{id}/revoke", pms("post", "PMS-Staff", "Revoke invite", parameters=[param("id", format="uuid")], responses=err(200, 404)))

# Reports & calendar & templates & overrides
add("/api/reports/occupancy", pms("get", "PMS-Reports", "Occupancy report", responses=err(200)))
add("/api/reports/revenue", pms("get", "PMS-Reports", "Revenue report", responses=err(200)))
add("/api/reports/guests", pms("get", "PMS-Reports", "Guest statistics", responses=err(200)))
add("/api/calendar/events", pms("get", "PMS-Calendar", "Calendar events", responses=err(200)))
pms_crud("/api/message-templates", "PMS-Templates", "message template")
add("/api/date-overrides", {**pms("get", "PMS-DateOverrides", "List date overrides", responses=err(200)), **pms("post", "PMS-DateOverrides", "Create date override", responses=err(201))})
add("/api/date-overrides/{id}", pms("delete", "PMS-DateOverrides", "Delete date override", parameters=[param("id", format="uuid")], responses=err(200)))

add(
    "/api/ical/{token}",
    pms(
        "get",
        "PMS-Public",
        "Public iCal feed",
        security=[],
        parameters=[param("token")],
        responses={"200": {"description": "text/calendar", "content": {"text/calendar": {"schema": {"type": "string"}}}}},
    ),
)

OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open("w", encoding="utf-8") as f:
    yaml.dump(spec, f, sort_keys=False, allow_unicode=True, width=120, default_flow_style=False)

print(f"Wrote {OUT} ({OUT.stat().st_size} bytes, {len(P)} paths)")
