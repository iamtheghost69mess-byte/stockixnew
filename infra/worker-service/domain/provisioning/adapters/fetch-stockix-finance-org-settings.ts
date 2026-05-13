// Fetches org build settings from an existing built Bigcapital instance.
// Used to inherit settings (currency, timezone, etc.) from the main org.

export interface OrgBuildSettings {
  name: string;
  baseCurrency: string;
  timezone: string;
  location: string;
  fiscalYear: string;
  language: string;
  dateFormat?: string;
}

/** MENA defaults used when main org is unreachable or not yet built */
export const MENA_DEFAULTS: OrgBuildSettings = {
  name: "",
  baseCurrency: "USD",
  timezone: "Asia/Beirut",
  location: "LB",
  fiscalYear: "January",
  language: "en-US",
  dateFormat: "MM/DD/YYYY",
};

function financeApiBase(internalBaseUrl: string): string {
  return internalBaseUrl.replace(/\/+$/, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseSigninToken(body: unknown): { accessToken: string; organizationId: string } | null {
  if (!isRecord(body)) return null;
  const accessToken =
    readString(body.accessToken) ?? readString(body.access_token) ?? readString(body.token);
  const organizationId =
    readString(body.organizationId) ?? readString(body.organization_id);
  if (!accessToken || !organizationId) return null;
  return { accessToken, organizationId };
}

function parseCurrentOrg(body: unknown): OrgBuildSettings | null {
  if (!isRecord(body)) return null;
  const builtAt = body.builtAt ?? body.built_at;
  const hasBuiltAt = builtAt !== null && builtAt !== undefined && builtAt !== "";
  if (!hasBuiltAt) return null;

  const metaRaw = body.metadata;
  const meta = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw;
  if (!isRecord(meta)) return null;

  const baseCurrency = readString(meta.baseCurrency) ?? readString(meta.base_currency);
  const timezone = readString(meta.timezone);
  const location = readString(meta.location);
  const fiscalYear = readString(meta.fiscalYear) ?? readString(meta.fiscal_year);
  const language = readString(meta.language);
  const dateFormat = readString(meta.dateFormat) ?? readString(meta.date_format);
  const name = readString(meta.name) ?? "";

  if (!baseCurrency || !timezone || !location || !fiscalYear || !language) {
    return null;
  }

  return {
    name,
    baseCurrency,
    timezone,
    location,
    fiscalYear,
    language,
    dateFormat,
  };
}

export async function fetchOrgSettingsFromMainInstance(params: {
  mainInternalBaseUrl: string;
  adminEmail: string;
  adminPassword: string;
  correlationId: string;
}): Promise<OrgBuildSettings | null> {
  const base = financeApiBase(params.mainInternalBaseUrl);
  const headersBase: Record<string, string> = {
    "Content-Type": "application/json",
    "x-request-id": params.correlationId,
    "x-correlation-id": params.correlationId,
  };

  let signinRes: Response;
  try {
    signinRes = await fetch(`${base}/api/auth/signin`, {
      method: "POST",
      headers: headersBase,
      body: JSON.stringify({
        email: params.adminEmail,
        password: params.adminPassword,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }

  let signinJson: unknown;
  try {
    signinJson = (await signinRes.json()) as unknown;
  } catch {
    return null;
  }

  if (!signinRes.ok) return null;

  const creds = parseSigninToken(signinJson);
  if (!creds) return null;

  let currentRes: Response;
  try {
    currentRes = await fetch(`${base}/api/organization/current`, {
      method: "GET",
      headers: {
        ...headersBase,
        Authorization: `Bearer ${creds.accessToken}`,
        "organization-id": creds.organizationId,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }

  let currentJson: unknown;
  try {
    currentJson = (await currentRes.json()) as unknown;
  } catch {
    return null;
  }

  if (!currentRes.ok) return null;

  return parseCurrentOrg(currentJson);
}
