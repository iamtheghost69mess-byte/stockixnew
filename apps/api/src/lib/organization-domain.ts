import { apiConfig } from "@repo/config";

export function rootDomainForOrganizationSubdomain(): string {
  const fromApi = apiConfig.rootDomain;
  if (typeof fromApi === "string" && fromApi.trim().length > 0) {
    return fromApi.trim();
  }
  return "localhost";
}
