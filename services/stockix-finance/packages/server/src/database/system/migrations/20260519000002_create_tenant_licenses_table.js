exports.up = function (knex) {
  return knex.schema.createTable('tenant_licenses', (table) => {
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
      .enu('status', ['active', 'expired', 'suspended', 'grace'])
      .notNullable()
      .defaultTo('active');
    table.timestamp('valid_from').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').nullable().defaultTo(null);
    table.integer('grace_period_days').notNullable().defaultTo(30);
    table.integer('max_users').notNullable().defaultTo(10);
    table.integer('max_organizations').notNullable().defaultTo(1);
    table.boolean('is_perpetual').notNullable().defaultTo(false);
    table.json('feature_flags').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('tenant_licenses');
};
