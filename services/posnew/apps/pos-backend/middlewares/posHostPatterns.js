const LOCALHOST_SUFFIX = ".localhost";

/** Stockix Traefik host pattern: `{slug}-pos.{ROOT_DOMAIN}`. Legacy: `{slug}.pos.zerowix.cloud`. */
function normalizeRootDomain() {
  return String(process.env.ROOT_DOMAIN || "localhost").toLowerCase().trim();
}

function posHostSuffixes() {
  const root = normalizeRootDomain();
  const suffixes = [];

  if (root === "localhost") {
    suffixes.push(LOCALHOST_SUFFIX);
  } else {
    suffixes.push(`-pos.${root}`);
  }

  const legacy = String(
    process.env.POS_LEGACY_SUBDOMAIN_SUFFIX || ".pos.zerowix.cloud"
  )
    .toLowerCase()
    .trim();
  if (legacy && !suffixes.includes(legacy)) {
    suffixes.push(legacy);
  }

  return suffixes;
}

function legacyPosRootHost() {
  const legacy = String(
    process.env.POS_LEGACY_SUBDOMAIN_SUFFIX || ".pos.zerowix.cloud"
  )
    .toLowerCase()
    .trim();
  if (legacy.startsWith(".")) {
    return legacy.slice(1);
  }
  return legacy;
}

function readSubdomainSlug(hostname) {
  const normalizedHost = String(hostname || "").toLowerCase().trim();
  if (!normalizedHost) return null;
  if (normalizedHost === "localhost" || normalizedHost === "127.0.0.1") {
    return null;
  }

  const legacyRoot = legacyPosRootHost();

  for (const suffix of posHostSuffixes()) {
    if (suffix === LOCALHOST_SUFFIX) {
      if (!normalizedHost.endsWith(LOCALHOST_SUFFIX)) continue;
      const prefix = normalizedHost.slice(
        0,
        normalizedHost.length - LOCALHOST_SUFFIX.length
      );
      if (!prefix || prefix.includes(".")) continue;
      return prefix;
    }

    if (normalizedHost === legacyRoot) continue;

    if (!normalizedHost.endsWith(suffix)) continue;

    const prefix = normalizedHost.slice(
      0,
      normalizedHost.length - suffix.length
    );
    if (!prefix || prefix.includes(".")) continue;
    return prefix;
  }

  return null;
}

function matchesWildcardPosOrigin(origin) {
  try {
    const url = new URL(String(origin));
    return readSubdomainSlug(url.hostname) != null;
  } catch {
    return false;
  }
}

module.exports = {
  readSubdomainSlug,
  matchesWildcardPosOrigin,
};
