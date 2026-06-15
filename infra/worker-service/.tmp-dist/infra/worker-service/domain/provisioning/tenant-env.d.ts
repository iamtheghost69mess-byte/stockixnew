export type TenantEnvFileParams = {
    stockixFinanceRoot: string;
    baseUrl: string;
    jwtSecret: string;
    dbPassword: string;
    dbRootPassword: string;
    publicProxyPort: number;
    signupAllowedEmails: string;
    agendashUser: string;
    agendashPassword: string;
};
export declare function buildTenantComposeEnvBody(params: TenantEnvFileParams): string;
export declare function writeTenantEnvFileAtomic(tenantEnvDir: string, contents: string): Promise<string>;
//# sourceMappingURL=tenant-env.d.ts.map