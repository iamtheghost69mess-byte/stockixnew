# Security Policy

Stockix takes security seriously. If you believe you have found a vulnerability, please report it responsibly.

## Reporting a vulnerability

**Do not** open a public GitHub issue for security findings.

Instead, use one of these channels:

1. **Preferred:** [GitHub Security Advisories](https://github.com/iamtheghost69mess-byte/stockixnew/security/advisories/new) (private disclosure)
2. Contact the repository maintainers directly if you cannot use GitHub Advisories

Include:

- A clear description of the issue and affected component (control plane API, dashboard, worker, POS, Finance, etc.)
- Steps to reproduce with proof of impact
- Whether the issue is tenant-scoping, authentication, authorization, or secret-handling related
- Your suggested fix, if any

We aim to acknowledge reports within **3 business days** and provide a remediation timeline when confirmed.

## Scope

In scope examples:

- Authentication or session bypass on the control plane or tenant apps
- Cross-tenant data access or privilege escalation
- Remote code execution on production infrastructure
- SQL injection, SSRF, or unsafe deserialization with demonstrable impact
- Exposure of secrets, tokens, or tenant credentials in logs, responses, or repositories

Generally out of scope:

- Missing security headers without demonstrated exploit
- Rate limiting or denial-of-service without a practical attack path
- Issues in third-party vendored services you run separately (e.g. Chatwoot upstream) unless introduced by Stockix integration code
- Findings from automated scanners without a validated exploit

## Safe testing

- Test only against systems you own or have explicit permission to test
- Do not access, modify, or exfiltrate data belonging to other tenants or users
- Do not perform destructive testing against production

## Supported versions

Security fixes are applied to the **`main`** branch and deployed to production. Older commits without active deployment support are not maintained separately.

| Branch / deployment | Supported |
| ------------------- | --------- |
| `main` (production) | Yes       |
| Other branches      | No        |

## Secret rotation

If a secret may have been exposed (committed to git, logged, or shared):

1. Rotate the affected value on the server (`infra/prod/.env` and tenant env files as needed)
2. Revoke leaked API tokens (Cloudflare, Resend, S3, GitHub PATs, etc.)
3. See [docs/SECRET_ROTATION_RUNBOOK.md](docs/SECRET_ROTATION_RUNBOOK.md) for platform-specific guidance
