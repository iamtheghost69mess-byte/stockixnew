declare namespace Express {
  interface Request {
    /** Set by TenancyGlobal.guard from the JWT `tenantId` claim. */
    tenantId: number;
    /** Set by TenancyGlobal.guard from the JWT `organizationId` claim. */
    organizationId: string;
  }
}
