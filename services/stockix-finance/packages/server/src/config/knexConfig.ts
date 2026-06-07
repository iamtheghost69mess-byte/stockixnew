import config from '@/config';
import { ITenant } from '@/interfaces';
import { buildFinanceMysqlKnexOptions, parseMysqlPort } from '@/database/finance-knex-options';

export const tenantKnexConfig = (tenant: ITenant) => {
  const { organizationId, id } = tenant;

  return {
    ...buildFinanceMysqlKnexOptions({
      host: config.tenant.db_host,
      port: parseMysqlPort(process.env.TENANT_DB_PORT || process.env.DB_PORT),
      user: config.tenant.db_user,
      password: config.tenant.db_password,
      database: `${config.tenant.db_name_prefix}${organizationId}`,
      charset: config.tenant.charset,
      pool: { min: 0, max: 5 },
    }),
    migrations: {
      directory: config.tenant.migrations_dir,
    },
    seeds: {
      tableName: 'stockix_seeds',
      directory: config.tenant.seeds_dir,
    },
    userParams: {
      tenantId: id,
      organizationId,
    },
  };
};

export const systemKnexConfig = {
  ...buildFinanceMysqlKnexOptions({
    host: config.system.db_host,
    port: parseMysqlPort(process.env.SYSTEM_DB_PORT || process.env.DB_PORT),
    user: config.system.db_user,
    password: config.system.db_password,
    database: config.system.db_name,
    charset: config.system.charset || 'utf8',
    pool: { min: 0, max: 7 },
  }),
  migrations: {
    directory: config.system.migrations_dir,
  },
  seeds: {
    directory: config.system.seeds_dir,
  },
};

export const systemDbManager = {
  collate: [],
  superUser: config.manager.superUser,
  superPassword: config.manager.superPassword,
};

export const tenantSeedConfig = (tenant: ITenant) => {
  return {
    directory: config.tenant.seeds_dir,
  };
};
