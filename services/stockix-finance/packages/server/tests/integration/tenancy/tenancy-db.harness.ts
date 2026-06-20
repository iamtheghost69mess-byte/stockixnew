import knex, { Knex } from 'knex';
import { knexSnakeCaseMappers } from 'objection';

const SQLITE_OPTIONS = {
  ...knexSnakeCaseMappers({ upperCase: true }),
};

export function createSystemSqliteKnex(): Knex {
  return knex({
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    ...SQLITE_OPTIONS,
  });
}

export function createTenantSqliteKnex(): Knex {
  return knex({
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    ...SQLITE_OPTIONS,
  });
}

export async function migrateSystemSchema(db: Knex): Promise<void> {
  await db.schema.createTable('tenants', (table) => {
    table.increments('id').primary();
    table.string('organization_id').notNullable();
  });

  await db.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('email').notNullable();
    table.integer('tenant_id').nullable();
  });

  await db.schema.createTable('user_tenants', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable();
    table.integer('tenant_id').notNullable();
    table.string('organization_id').notNullable();
    table.string('role').nullable();
  });
}

export async function migrateTenantSchema(db: Knex): Promise<void> {
  await db.schema.createTable('contacts', (table) => {
    table.increments('id').primary();
    table.string('contact_service').notNullable();
    table.string('contact_type').notNullable().defaultTo('individual');
    table.string('display_name').notNullable();
  });
}

export async function seedSystemDb(db: Knex): Promise<void> {
  await db('tenants').insert([
    { id: 7, organization_id: 'org-a' },
    { id: 5, organization_id: 'org-b' },
    { id: 12, organization_id: 'org-c' },
  ]);

  await db('users').insert([
    { id: 42, email: 'user@example.com', tenant_id: 99 },
  ]);

  await db('user_tenants').insert([
    { user_id: 42, tenant_id: 7, organization_id: 'org-a' },
    { user_id: 42, tenant_id: 5, organization_id: 'org-b' },
    { user_id: 42, tenant_id: 12, organization_id: 'org-c' },
  ]);
}

export async function seedTenantContact(
  db: Knex,
  displayName: string,
  id = 1,
): Promise<void> {
  await db('contacts').insert({
    id,
    contact_service: 'customer',
    contact_type: 'individual',
    display_name: displayName,
  });
}

export type TenancyKnexProxy = () => Knex;

/**
 * Mirrors TenancyDB.module.ts routing: organizationId from CLS → dedicated knex instance.
 */
export function createTenancyKnexProxy(
  dbsByOrg: Map<string, Knex>,
  getOrganizationId: () => string | undefined,
): TenancyKnexProxy {
  return () => {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      throw new Error('organizationId not set in CLS');
    }
    const instance = dbsByOrg.get(organizationId);
    if (!instance) {
      throw new Error(`No tenant database for organization ${organizationId}`);
    }
    return instance;
  };
}

export async function destroyKnexInstances(...instances: Knex[]): Promise<void> {
  await Promise.all(
    instances.filter(Boolean).map((instance) => instance.destroy()),
  );
}
