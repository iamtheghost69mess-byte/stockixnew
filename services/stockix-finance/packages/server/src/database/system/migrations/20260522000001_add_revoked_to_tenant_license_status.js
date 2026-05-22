exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('tenant_licenses'))) {
    return;
  }
  return knex.raw(
    "ALTER TABLE tenant_licenses MODIFY COLUMN status " +
      "ENUM('active', 'expired', 'suspended', 'grace', 'revoked') " +
      "NOT NULL DEFAULT 'active'",
  );
};

exports.down = function (knex) {
  return knex.raw(
    "ALTER TABLE tenant_licenses MODIFY COLUMN status " +
      "ENUM('active', 'expired', 'suspended', 'grace') " +
      "NOT NULL DEFAULT 'active'",
  );
};
