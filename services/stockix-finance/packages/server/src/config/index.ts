import path from 'path';
import { castCommaListEnvVarToArray, parseBoolean } from '@/utils';

const env = process.env as Record<string, string | undefined>;
const resolvedDbClient = env.SYSTEM_DB_CLIENT || env.DB_CLIENT || 'mysql';
const resolvedDbHost = env.SYSTEM_DB_HOST || env.DB_HOST || 'mysql';
const resolvedDbUser =
  env.SYSTEM_DB_USER || env.DB_USER || env.MYSQL_USER || 'stockix_tenant';
const resolvedDbPassword =
  env.SYSTEM_DB_PASSWORD ||
  env.DB_PASSWORD ||
  env.MYSQL_PASSWORD ||
  env.MYSQL_ROOT_PASSWORD ||
  '';

module.exports = {
  /**
   * Your favorite port
   */
  port: Number(env.PORT),

  /**
   * System database configuration.
   */
  system: {
    db_client: resolvedDbClient,
    db_host: resolvedDbHost,
    db_user: resolvedDbUser,
    db_password: resolvedDbPassword,
    db_name: env.SYSTEM_DB_NAME,
    charset: env.SYSTEM_DB_CHARSET || env.DB_CHARSET,
    migrations_dir: path.join(global.__root_dir, './src/system/migrations'),
    seeds_dir: path.join(global.__root_dir, './src/system/seeds'),
  },

  /**
   * Tenant database configuration.
   */
  tenant: {
    db_client: env.TENANT_DB_CLIENT || resolvedDbClient,
    db_name_prefix: env.TENANT_DB_NAME_PERFIX,
    db_host: env.TENANT_DB_HOST || resolvedDbHost,
    db_user: env.TENANT_DB_USER || resolvedDbUser,
    db_password: env.TENANT_DB_PASSWORD || resolvedDbPassword,
    charset: env.TENANT_DB_CHARSET || env.DB_CHARSET,
    migrations_dir: path.join(global.__root_dir, './src/database/migrations'),
    seeds_dir: path.join(global.__root_dir, './src/database/seeds/core'),
  },

  /**
   * Databases manager config.
   */
  manager: {
    superUser: resolvedDbUser,
    superPassword: resolvedDbPassword,
  },

  /**
   * Mail.
   */
  mail: {
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: env.MAIL_SECURE === '1' || env.MAIL_SECURE === 'true',
    username: env.MAIL_USERNAME,
    password: env.MAIL_PASSWORD,
  },

  /**
   * Mongo DB.
   */
  mongoDb: {
    /**
     * That long string from mlab
     */
    databaseURL: env.MONGODB_DATABASE_URL,
  },

  /**
   * Agenda
   */
  agenda: {
    dbCollection: env.AGENDA_DB_COLLECTION,
    pooltime: env.AGENDA_POOL_TIME,
    concurrency: Number(env.AGENDA_CONCURRENCY),
  },

  /**
   * Agendash.
   */
  agendash: {
    user: env.AGENDASH_AUTH_USER,
    password: env.AGENDASH_AUTH_PASSWORD,
  },

  /**
   * Easy SMS gateway.
   */
  easySMSGateway: {
    api_key: env.EASY_SMS_TOKEN,
  },

  /**
   * JWT secret.
   */
  jwtSecret: env.JWT_SECRET,

  /**
   * 
   */
  resetPasswordSeconds: 600,

  /**
   * Application base URL.
   */
  baseURL: env.BASE_URL,

  /**
   * General API prefix.
   */
  api: {
    prefix: '/api',
  },

  /**
   * Redis storage configuration.
   */
  redis: {
    port: 6379,
  },

  /**
   * Throttler configuration.
   */
  throttler: {
    login: {
      points: 5,
      duration: 60 * 60 * 24 * 1, // Store number for 90 days since first fail
      blockDuration: 60 * 15,
    },
    requests: {
      points: 60,
      duration: 60,
      blockDuration: 60 * 10,
    },
  },

  /**
   * Sign-up restrictions
   */
  signupRestrictions: {
    disabled: parseBoolean<boolean>(env.SIGNUP_DISABLED, false),
    allowedDomains: castCommaListEnvVarToArray(
      env.SIGNUP_ALLOWED_DOMAINS
    ),
    allowedEmails: castCommaListEnvVarToArray(
      env.SIGNUP_ALLOWED_EMAILS
    ),
  },

  /**
   * Puppeteer remote browserless connection.
   */
  puppeteer: {
    browserWSEndpoint: env.BROWSER_WS_ENDPOINT,
  },

  scheduleComputeItemCost: 'in 5 seconds',

  /**
   * Latest tenant database batch number.
   *
   * Should increment the batch number once you create a new migrations or seeds
   * to application detarmines to upgrade.
   */
  databaseBatch: 4,
};
