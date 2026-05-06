export declare const apiConfig: {
  readonly databaseUrl: string | undefined;
  readonly platformApiSecret: string | undefined;
  readonly dashboardUrl: string | undefined;
  readonly rootDomain: string | undefined;
  readonly corsOrigins: string[];
  readonly port: number;
  readonly publicBaseUrlScheme: string;
  readonly maxTenantPort: number;
  readonly tenantInternalHost: string;
  readonly tenantEnvRoot: string | undefined;
  readonly repoRoot: string | undefined;
  readonly stockixTenantAppRoot: string | undefined;
  readonly traefikDynamicDir: string;
  readonly traefikTenantUpstreamHost: string;
  readonly bootstrapAdminEmail: string | undefined;
  readonly bootstrapAdminPassword: string | undefined;
  readonly nodeEnv: string;
  readonly hostname: string;
  readonly sessionSecret: string;
  readonly authTokenSecret: string;
  readonly allowBootstrapLogin: boolean;
  readonly tenantDbNamePrefix: string | undefined;
  readonly validateRequiredEnv: () => void;
  readonly workerJobId: string | undefined;
  readonly metricsEndpoint: string | undefined;
  readonly metricsAuthToken: string | undefined;
  readonly deploymentSecretKey: string;
};

export declare const dashboardConfig: {
  readonly databaseUrl: string | undefined;
  readonly sessionSecret: string | undefined;
  readonly platformApiSecret: string | undefined;
  readonly platformAdminEmail: string | undefined;
  readonly platformAdminPassword: string | undefined;
  readonly nodeEnv: string;
  readonly nextPublicApiUrl: string;
  readonly nextPublicScheme: string;
  readonly nextPublicRootDomain: string;
  readonly nextPublicLocalTenantHost: string;
  readonly securityHsts: string;
  readonly securityXFrameOptions: string;
  readonly securityReferrerPolicy: string;
  readonly securityXContentTypeOptions: string;
  readonly securityCspBase: string;
};

export declare const dbConfig: {
  readonly databaseUrl: string | undefined;
  readonly waitTimeoutMs: number;
};

export declare const infraConfig: {
  readonly rootDomain: string | undefined;
  readonly nextPublicStockixApiUrl: string | undefined;
  readonly postgresUser: string | undefined;
  readonly postgresPassword: string | undefined;
  readonly postgresDb: string | undefined;
  readonly postgresHostPort: string | undefined;
  readonly acmeEmail: string | undefined;
  readonly cloudflareDnsToken: string | undefined;
  readonly stockixRepo: string | undefined;
};
