// Phase 1: user_tenants join table for multi-org single-login (Path A)
exports.up = async function (knex) {
  await knex.schema.createTable('user_tenants', function (table) {
    table.increments('id').primary();

    // FK → users.id (integer, matches users table increments())
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // FK → tenants.id (bigInteger, matches tenants table bigIncrements())
    table
      .bigInteger('tenant_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('tenants')
      .onDelete('CASCADE');

    // Denormalized copy of tenants.organization_id for fast guard lookups
    table.string('organization_id', 255).notNullable();

    // Reserved for future system-level role per membership
    table.string('role', 50).nullable().defaultTo(null);

    table.timestamps(true, true);

    // Constraints
    table.unique(['user_id', 'tenant_id']);
  });

  // Backfill existing memberships from users.tenant_id (after DDL commits)
  await knex.raw(`
    INSERT INTO USER_TENANTS (user_id, tenant_id, organization_id, created_at, updated_at)
    SELECT
      u.id          AS user_id,
      u.tenant_id   AS tenant_id,
      t.organization_id AS organization_id,
      NOW()         AS created_at,
      NOW()         AS updated_at
    FROM USERS u
    INNER JOIN TENANTS t ON t.id = u.tenant_id
    WHERE u.tenant_id IS NOT NULL
    ON DUPLICATE KEY UPDATE updated_at = NOW()
  `);
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('user_tenants');
};
