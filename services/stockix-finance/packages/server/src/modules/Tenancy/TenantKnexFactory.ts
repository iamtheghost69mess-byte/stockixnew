import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex';
import { TenantModel } from '@/modules/System/models/TenantModel';
import { Inject } from '@nestjs/common';
import { buildTenantKnexOptionsFromConfig } from '@/database/finance-knex-options';
import { sanitizeDatabaseName } from '@/utils/sanitize-database-name';

@Injectable()
export class TenantKnexFactory {
  private readonly cache = new Map<string, Knex>();

  constructor(
    private readonly configService: ConfigService,
    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
  ) {}

  async getKnexForTenantId(tenantId: number): Promise<Knex> {
    const tenant = await this.tenantModel.query().findById(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
    return this.getKnexForOrganizationId(tenant.organizationId);
  }

  getKnexForOrganizationId(organizationId: string): Knex {
    const prefix = this.configService.get<string>('tenantDatabase.dbNamePrefix');
    const database = sanitizeDatabaseName(`${prefix}${organizationId}`);
    const cached = this.cache.get(database);
    if (cached) {
      return cached;
    }

    const instance = knex(
      buildTenantKnexOptionsFromConfig(this.configService, database, {
        pool: { min: 0, max: 7 },
      }),
    );

    this.cache.set(database, instance);
    return instance;
  }
}
