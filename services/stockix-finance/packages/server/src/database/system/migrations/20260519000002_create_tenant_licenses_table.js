async function tenantLicensesTableExists(knex) {
  if (await knex.schema.hasTable('tenant_licenses')) {
    return true;
  }
  const result = await knex.raw("SHOW TABLES LIKE 'tenant_licenses'");
  const rows = Array.isArray(result) ? result[0] : result;
  return Array.isArray(rows) && rows.length > 0;
}

exports.up = async function (knex) {
  if (await tenantLicensesTableExists(knex)) {
    return;
  }
  try {
    await knex.schema.createTable('tenant_licenses', (table) => {
    table.increments('id').primary();
    table
      .bigInteger('tenant_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('tenants')
      .onDelete('CASCADE');
    table.string('plan_slug', 100).notNullable().defaultTo('owner-managed');
    table
      .enu('status', ['active', 'expired', 'suspended', 'grace', 'revoked'])
      .notNullable()
      .defaultTo('active');
    table.timestamp('valid_from').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').nullable().defaultTo(null);
    table.integer('grace_period_days').notNullable().defaultTo(30);
    table.integer('max_users').notNullable().defaultTo(999);
    table.integer('max_activations').notNullable().defaultTo(1);
    table.integer('max_organizations').notNullable().defaultTo(1);
    table.boolean('is_perpetual').notNullable().defaultTo(false);
    table.json('feature_flags').nullable();
    table.timestamps(true, true);
    });
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : '';
    const errno = err && typeof err === 'object' ? err.errno : 0;
    if (code === 'ER_TABLE_EXISTS_ERROR' || errno === 1050) {
      return;
    }
    throw err;
  }
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('tenant_licenses');
};
