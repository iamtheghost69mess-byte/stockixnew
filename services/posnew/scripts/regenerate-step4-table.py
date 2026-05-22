#!/usr/bin/env python3
"""Regenerate details.md STEP 4 table from STEP 1 numbered routes."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DETAILS = ROOT / "details.md"

OK, NO, WARN = "\u2705", "\u274c", "\u26a0\ufe0f"


def main():
    text = DETAILS.read_text(encoding="utf-8")
    s1_start = text.index("## STEP 1")
    s1_end = text.index("*End of Step 1 Data Collection.*")
    step1 = text[s1_start:s1_end]

    current_file = "unknown"
    rows: list[tuple[float, str, str, str]] = []

    for line in step1.splitlines():
        # Filename is first `...` after '(' (headers may add text after closing backtick).
        msec = re.match(r"^### .+\(`([^`]+)`", line)
        if msec:
            current_file = msec.group(1)
            continue

        m = re.match(
            r"^(\d+)\.\s+\*\*(GET|POST|PUT|PATCH|DELETE)\*\*\s+`([^`]+)`",
            line,
        )
        if m:
            rows.append((int(m.group(1)), m.group(2), m.group(3), current_file))

    for line in step1.splitlines():
        if "*Also:*" in line and "variants" in line:
            m = re.search(r"\*\*(GET|POST|PUT|PATCH|DELETE)\*\*\s+`([^`]+)`", line)
            if m:
                rows.append((103.5, m.group(1), m.group(2), "menuItemRoute.js"))
            break

    rows.sort(key=lambda r: r[0])

    supp = [
        ("GET", "/api/v1/platform/organizations/:id/provisioning-status"),
        ("PATCH", "/api/v1/platform/organizations/:id/credentials/:role/reset-pin"),
        ("DELETE", "/api/v1/platform/organizations/:id"),
        ("GET", "/api/v1/platform/system-settings"),
        ("PATCH", "/api/v1/platform/system-settings"),
        ("GET", "/api/v1/platform/reports/pnl"),
        ("GET", "/api/v1/platform/reports/trial-balance"),
        ("GET", "/api/v1/platform/reports/inventory-valuation"),
        ("GET", "/api/v1/platform/reports/balance-sheet"),
        ("GET", "/api/v1/platform/reports/cash-flow"),
        ("GET", "/api/v1/platform/reports/ar-aging"),
        ("GET", "/api/v1/platform/reports/budget-vs-actual"),
        ("GET", "/api/v1/platform/inventory/low-stock"),
        ("GET", "/api/v1/platform/inventory/slow-moving"),
        ("GET", "/api/v1/platform/inventory/movements"),
        ("GET", "/api/v1/platform/users/global"),
        ("GET", "/api/v1/platform/users/global/:id"),
        ("PATCH", "/api/v1/platform/users/global/:id/status"),
        ("POST", "/api/v1/platform/users/global/:id/reset"),
        ("GET", "/api/v1/platform/notifications"),
        ("GET", "/api/v1/platform/notifications/unread-count"),
        ("POST", "/api/v1/platform/notifications/:id/read"),
        ("GET", "/api/v1/platform/subscriptions"),
        ("PATCH", "/api/v1/platform/subscriptions/:id"),
        ("GET", "/api/v1/platform/jobs"),
        ("DELETE", "/api/v1/platform/webhooks/endpoints/:id"),
        ("GET", "/api/v1/platform/webhooks/outbox"),
        ("GET", "/api/v1/platform/flags"),
    ]
    base = 263
    for i, pair in enumerate(supp):
        rows.append((base + i, pair[0], pair[1], "platformV1Route.js"))

    def dash_info(method: str, ep: str) -> tuple[str, str, str]:
        if not ep.startswith("/api/v1/platform"):
            if ep in ("/health", "/metrics", "/ready"):
                return "N/A", OK, "Ops / probe (not SaaS Dash)"
            if ep.startswith("/api/auth/login") and method == "POST":
                return "`login/page.tsx` (tenant)", OK, "Tenant login"
            return "N/A", NO, "Tenant / POS (not SaaS Dash)"

        mapping: dict[tuple[str, str], tuple[str, str, str]] = {
            ("POST", "/api/v1/platform/auth/login"): ("`login/page.tsx`", OK, "Handled"),
            ("POST", "/api/v1/platform/auth/refresh"): ("`platform-http.ts`", OK, "Auto-refresh"),
            ("GET", "/api/v1/platform/auth/me"): ("`layout.tsx`", OK, "Handled"),
            ("POST", "/api/v1/platform/auth/api-keys"): ("`api-keys/page.tsx`", OK, "Handled"),
            ("GET", "/api/v1/platform/auth/api-keys"): ("`api-keys/page.tsx`", OK, "Handled"),
            ("POST", "/api/v1/platform/auth/api-keys/:id/revoke"): (
                "`api-keys/page.tsx`",
                OK,
                "With confirmation",
            ),
            ("GET", "/api/v1/platform/organizations"): ("`organizations/page.tsx`", OK, "Pagination"),
            ("POST", "/api/v1/platform/organizations"): ("`organizations/page.tsx`", OK, "Create org"),
            ("GET", "/api/v1/platform/organizations/:id"): (
                "`organizations/[id]/page.tsx`",
                OK,
                "Handled",
            ),
            ("PATCH", "/api/v1/platform/organizations/:id/lifecycle"): (
                "`organizations/[id]/page.tsx`",
                OK,
                "With confirmation",
            ),
            ("PATCH", "/api/v1/platform/organizations/:id/entitlements"): (
                "`organizations/[id]/page.tsx`",
                OK,
                "Handled",
            ),
            ("POST", "/api/v1/platform/bootstrap"): (
                "`organizations/[id]/page.tsx`",
                OK,
                "With confirmation",
            ),
            ("GET", "/api/v1/platform/metrics/summary"): ("`page.tsx` (Overview)", OK, "Handled"),
            ("GET", "/api/v1/platform/metrics/kpis"): ("`page.tsx` (Overview)", OK, "Handled"),
            ("GET", "/api/v1/platform/metrics/analytics"): ("`page.tsx` (Overview)", OK, "Handled"),
            ("GET", "/api/v1/platform/stream"): ("`layout.tsx` / SSE", OK, "Post-audit: SSE"),
            ("GET", "/api/v1/platform/jobs/:queue/:id"): (
                "`jobs/[queue]/[id]/page.tsx`",
                OK,
                "Handled",
            ),
            ("POST", "/api/v1/platform/jobs/:queue/:id/retry"): (
                "`jobs/[queue]/[id]/page.tsx`",
                OK,
                "Handled",
            ),
            ("POST", "/api/v1/platform/webhooks/endpoints"): ("`webhooks/page.tsx`", OK, "Handled"),
            ("GET", "/api/v1/platform/webhooks/endpoints"): ("`webhooks/page.tsx`", OK, "Handled"),
            ("POST", "/api/v1/platform/webhooks/outbox"): ("N/A", NO, "No manual outbox UI"),
            ("GET", "/api/v1/platform/webhooks/outbox"): ("N/A", NO, "No list UI"),
            ("DELETE", "/api/v1/platform/webhooks/endpoints/:id"): ("N/A", NO, "Revoke endpoint UI TBD"),
            ("POST", "/api/v1/platform/billing/webhooks/inbound"): ("N/A", NO, "Backend / Stripe"),
            ("POST", "/api/v1/platform/billing/simulate/subscription"): ("N/A", NO, "Simulator only"),
            ("POST", "/api/v1/platform/billing/simulate/suspend"): ("N/A", NO, "Simulator only"),
            ("POST", "/api/v1/platform/compliance/export"): ("`compliance/page.tsx`", OK, "Handled"),
            ("POST", "/api/v1/platform/compliance/deletion"): ("`compliance/page.tsx`", OK, "Handled"),
            ("POST", "/api/v1/platform/invitations"): ("team / settings", OK, "Post-audit: invites UI"),
            ("PUT", "/api/v1/platform/flags"): ("`flags/page.tsx`", OK, "Post-audit: flags UI"),
            ("GET", "/api/v1/platform/flags/evaluate"): ("N/A", NO, "Backend / tooling"),
            ("GET", "/api/v1/platform/flags"): ("`flags/page.tsx`", OK, "List flags"),
            ("POST", "/api/v1/platform/impersonation/session"): (
                "`organizations/[id]/page.tsx`",
                OK,
                "Post-audit: impersonate",
            ),
            ("GET", "/api/v1/platform/audits"): ("`audits/page.tsx`", OK, "Handled"),
            ("GET", "/api/v1/platform/openapi.json"): ("N/A", NO, "No embedded viewer"),
            ("GET", "/api/v1/platform/organizations/:id/provisioning-status"): (
                "`organizations/[id]/page.tsx`",
                OK,
                "Provisioning status",
            ),
            ("PATCH", "/api/v1/platform/organizations/:id/credentials/:role/reset-pin"): (
                "`organizations/[id]/page.tsx`",
                OK,
                "PIN reset",
            ),
            ("DELETE", "/api/v1/platform/organizations/:id"): ("N/A", NO, "Delete org UI TBD"),
            ("GET", "/api/v1/platform/system-settings"): ("N/A", NO, "Owner settings UI TBD"),
            ("PATCH", "/api/v1/platform/system-settings"): ("N/A", NO, "Owner settings UI TBD"),
            ("GET", "/api/v1/platform/reports/pnl"): (
                "`reports/page.tsx`",
                WARN,
                "Confirm base URL /api/v1/platform",
            ),
            ("GET", "/api/v1/platform/reports/trial-balance"): (
                "`reports/page.tsx`",
                WARN,
                "Confirm base URL /api/v1/platform",
            ),
            ("GET", "/api/v1/platform/reports/inventory-valuation"): (
                "`reports/page.tsx`",
                WARN,
                "Confirm base URL /api/v1/platform",
            ),
            ("GET", "/api/v1/platform/reports/balance-sheet"): (
                "`reports/page.tsx`",
                WARN,
                "Optional report UI",
            ),
            ("GET", "/api/v1/platform/reports/cash-flow"): (
                "`reports/page.tsx`",
                WARN,
                "Optional report UI",
            ),
            ("GET", "/api/v1/platform/reports/ar-aging"): (
                "`reports/page.tsx`",
                WARN,
                "Optional report UI",
            ),
            ("GET", "/api/v1/platform/reports/budget-vs-actual"): (
                "`reports/page.tsx`",
                WARN,
                "Optional report UI",
            ),
            ("GET", "/api/v1/platform/inventory/low-stock"): ("N/A", NO, "Platform metrics feed"),
            ("GET", "/api/v1/platform/inventory/slow-moving"): ("N/A", NO, "Platform metrics feed"),
            ("GET", "/api/v1/platform/inventory/movements"): ("N/A", NO, "Platform metrics feed"),
            ("GET", "/api/v1/platform/users/global"): ("N/A", NO, "Global users UI TBD"),
            ("GET", "/api/v1/platform/users/global/:id"): ("N/A", NO, "Global users UI TBD"),
            ("PATCH", "/api/v1/platform/users/global/:id/status"): ("N/A", NO, "Global users UI TBD"),
            ("POST", "/api/v1/platform/users/global/:id/reset"): ("N/A", NO, "Global users UI TBD"),
            ("GET", "/api/v1/platform/notifications"): (
                "`notifications/page.tsx`",
                OK,
                "Post-audit: notifications",
            ),
            ("GET", "/api/v1/platform/notifications/unread-count"): ("N/A", NO, "Unread badge TBD"),
            ("POST", "/api/v1/platform/notifications/:id/read"): ("N/A", NO, "Mark read TBD"),
            ("GET", "/api/v1/platform/subscriptions"): ("N/A", NO, "Subscriptions UI TBD"),
            ("PATCH", "/api/v1/platform/subscriptions/:id"): ("N/A", NO, "Subscriptions UI TBD"),
            ("GET", "/api/v1/platform/jobs"): ("N/A", NO, "Job list UI TBD"),
        }
        key = (method, ep)
        if key in mapping:
            return mapping[key]
        return "N/A", NO, "See saas-dash source"

    def backend_file_for(ep: str, fallback: str) -> str:
        if ep in ("/health", "/metrics", "/ready"):
            return "healthRoute.js"
        if ep == "/api/upload":
            return "uploadRoute.js"
        if ep.startswith("/api/user"):
            return "userRoute.js"
        if ep.startswith("/api/payment"):
            return "paymentRoute.js"
        return fallback

    lines_out = [
        "## STEP 4 — Final Audit Table",
        "",
        "> **Note (2026-04-15):** Regenerated from **Step 1** (columns `#`, method, path, `Backend File`). "
        "Rows **263+** add platform routes from the Step 1 *supplement* paragraph. "
        f"Status: {OK} owner-dash / post-audit, {NO} not in owner UI, {WARN} verify client wiring.",
        "",
        "| # | API Endpoint | Method | Backend File | Dashboard Page | Status | What's Missing |",
        "|--:|:---|:---:|:---|:---|:---:|:---|",
    ]

    for num, method, ep, bfile in rows:
        page, sym, note = dash_info(method, ep)
        bfile = backend_file_for(ep, bfile)
        num_s = str(int(num)) if float(num).is_integer() else str(num)
        lines_out.append(
            f"| {num_s} | `{ep}` | {method} | `{bfile}` | {page} | {sym} | {note} |"
        )

    lines_out.append("")
    lines_out.append("---")
    lines_out.append("*End of Step 4 Final Audit Table.*")
    lines_out.append("")

    new_step4 = "\n".join(lines_out)
    if "## STEP 4" in text:
        t4_start = text.index("## STEP 4")
        # Replace up to next section marker if present
        next_markers = [m for m in ("## STEP 5", "## Current Notes", "## Post-Audit Integration Resolution") if m in text[t4_start + 1 :]]
        if next_markers:
            rel = min(text[t4_start + 1 :].index(m) for m in next_markers)
            t4_end = t4_start + 1 + rel
        else:
            t4_end = len(text)
        DETAILS.write_text(text[:t4_start] + new_step4 + "\n" + text[t4_end:], encoding="utf-8")
    else:
        insert_at = text.index("*End of Step 1 Data Collection.*") + len("*End of Step 1 Data Collection.*")
        DETAILS.write_text(text[:insert_at] + "\n\n" + new_step4 + text[insert_at:], encoding="utf-8")
    print("Wrote", len(rows), "rows to Step 4")


if __name__ == "__main__":
    main()
