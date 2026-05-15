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
  fiscalYear: "january",
  language: "en",
  dateFormat: "MM/DD/yyyy",
};

export function normalizeFiscalYearForFinanceBuild(value: string): string {
  return value.trim().toLowerCase();
}

/** Finance `BuildOrganizationDto.language`: ACCEPTED_LOCALES = ['en', 'ar']. */
export function normalizeLanguageForFinanceBuild(value: string): string {
  const primary = value.trim().split(/[-_]/)[0]?.toLowerCase() ?? "en";
  return primary === "ar" ? "ar" : "en";
}

/** Finance `DATE_FORMATS` use lowercase `yyyy` for four-digit years. */
export function normalizeDateFormatForFinanceBuild(value: string): string {
  return value.trim().replace(/YYYY/g, "yyyy");
}

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
    fiscalYear: normalizeFiscalYearForFinanceBuild(fiscalYear),
    language: normalizeLanguageForFinanceBuild(language),
    dateFormat: dateFormat ? normalizeDateFormatForFinanceBuild(dateFormat) : undefined,
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
