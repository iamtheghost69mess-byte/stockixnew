#!/usr/bin/env bash
# Verify SPF, DKIM, and DMARC DNS records for the production domain.
# Usage: bash scripts/verify-email-dns.sh <domain>
# Example: bash scripts/verify-email-dns.sh yourdomain.com

set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <domain>"
  echo "Example: $0 stockix.cloud"
  exit 1
fi

ERRORS=0

check_pass() { echo "  ✅ $1"; }
check_fail() { echo "  ❌ $1"; ERRORS=$((ERRORS + 1)); }
check_warn() { echo "  ⚠️  $1"; }

echo ""
echo "=== Email DNS Verification for: $DOMAIN ==="
echo ""

# ── SPF ──────────────────────────────────────────────────────────────
echo "SPF (Sender Policy Framework)"
SPF=$(dig +short TXT "$DOMAIN" 2>/dev/null | grep "v=spf1" | tr -d '"' || true)
if [ -z "$SPF" ]; then
  check_fail "No SPF TXT record found on $DOMAIN"
  echo "         Fix: Add TXT record → v=spf1 include:amazonses.com include:_spf.resend.com ~all"
else
  check_pass "SPF found: $SPF"
  if echo "$SPF" | grep -qiE "~all|\-all"; then
    check_pass "SPF ends with ~all or -all (correctly restrictive)"
  else
    check_warn "SPF ends with ?all or +all — consider tightening to ~all or -all"
  fi
fi
echo ""

# ── DKIM — Resend ─────────────────────────────────────────────────────
echo "DKIM (DomainKeys Identified Mail — Resend)"
DKIM_RESEND=$(dig +short TXT "resend._domainkey.$DOMAIN" 2>/dev/null | tr -d '"' || true)
if [ -z "$DKIM_RESEND" ]; then
  check_fail "No resend._domainkey.$DOMAIN TXT record found"
  echo "         Fix: Add the DKIM TXT record from your Resend domain dashboard"
else
  check_pass "Resend DKIM record found"
fi
echo ""

# ── DKIM — SES (optional) ─────────────────────────────────────────────
echo "DKIM (Amazon SES — optional, skip if not using SES)"
for selector in amazonses; do
  DKIM_SES=$(dig +short TXT "${selector}._domainkey.$DOMAIN" 2>/dev/null | tr -d '"' || true)
  if [ -z "$DKIM_SES" ]; then
    check_warn "No ${selector}._domainkey.$DOMAIN record — OK if SES is not used"
  else
    check_pass "SES DKIM selector '${selector}' found"
  fi
done
echo ""

# ── DMARC ─────────────────────────────────────────────────────────────
echo "DMARC (Domain-based Message Authentication)"
DMARC=$(dig +short TXT "_dmarc.$DOMAIN" 2>/dev/null | grep "v=DMARC1" | tr -d '"' || true)
if [ -z "$DMARC" ]; then
  check_fail "No _dmarc.$DOMAIN TXT record found"
  echo "         Fix: Add TXT record → v=DMARC1; p=quarantine; rua=mailto:dmarc@$DOMAIN"
else
  check_pass "DMARC found: $DMARC"
  if echo "$DMARC" | grep -q "p=none"; then
    check_warn "DMARC policy is 'none' — consider upgrading to p=quarantine or p=reject"
  elif echo "$DMARC" | grep -qE "p=quarantine|p=reject"; then
    check_pass "DMARC policy is enforcing (quarantine or reject)"
  fi
  if echo "$DMARC" | grep -q "rua="; then
    check_pass "DMARC aggregate reports (rua) configured"
  else
    check_warn "DMARC rua not set — add rua=mailto:dmarc@$DOMAIN to receive reports"
  fi
fi
echo ""

# ── MX records (sanity check) ─────────────────────────────────────────
echo "MX (Mail Exchange — sanity check)"
MX=$(dig +short MX "$DOMAIN" 2>/dev/null || true)
if [ -z "$MX" ]; then
  check_warn "No MX records found on $DOMAIN — transactional email only (no inbound)"
else
  check_pass "MX records present: $(echo "$MX" | head -1)"
fi
echo ""

# ── Result ────────────────────────────────────────────────────────────
echo "──────────────────────────────────────────────"
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ All required email DNS checks passed for $DOMAIN"
  exit 0
else
  echo "❌ $ERRORS check(s) failed — fix before go-live to avoid emails landing in spam"
  exit 1
fi
