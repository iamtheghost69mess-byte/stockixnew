const INACTIVE_LIFECYCLES = new Set(["suspended", "pending_closure", "deleted", "draft"]);

function toEpochMs(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function formatInTimezone(value, timezone) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(value).replace(" ", "T");
}

function formatDateInTimezone(value, timezone) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(value);
}

function getOrganizationAccessState(input) {
  const lifecycle = String(input.lifecycle || "active").trim().toLowerCase();
  if (INACTIVE_LIFECYCLES.has(lifecycle)) {
    const label =
      lifecycle === "suspended"
        ? "suspended"
        : lifecycle === "pending_closure"
          ? "pending closure"
          : lifecycle === "deleted"
            ? "deleted"
            : "not active";
    return {
      status: "suspended",
      reason: `Organization is ${label}. Contact support to restore access.`,
      blocked: true,
      blockCode: "ORGANIZATION_NOT_ACTIVE",
    };
  }

  const timezoneRaw = String(input.timezone || "Asia/Beirut").trim();
  const timezone = isValidTimezone(timezoneRaw) ? timezoneRaw : "Asia/Beirut";
  const now = input.now instanceof Date ? input.now : new Date();
  const nowMs = now.getTime();
  const startMs = toEpochMs(input.licenseStartDate);
  const endMs = toEpochMs(input.licenseEndDate);

  if (startMs == null || endMs == null) {
    return {
      status: "not_started",
      reason: "Store license window is not configured. Contact support.",
      blocked: true,
    };
  }
  if (nowMs < startMs) {
    return {
      status: "not_started",
      reason: `Store access starts at ${formatInTimezone(new Date(startMs), timezone)} (${timezone}).`,
      blocked: true,
    };
  }
  if (nowMs > endMs) {
    return {
      status: "expired",
      reason: `Store license expired on ${formatDateInTimezone(new Date(endMs), timezone)}. Contact support!`,
      blocked: true,
    };
  }
  return {
    status: "active",
    reason: "License window is active.",
    blocked: false,
  };
}

module.exports = { getOrganizationAccessState };
