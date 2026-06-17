exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('tenant_licenses'))) {
    return;
  }
  const hasCol = await knex.schema.hasColumn('tenant_licenses', 'license_key');
  if (hasCol) {
    return;
  }
  await knex.schema.table('tenant_licenses', (table) => {
    table.string('license_key', 64).nullable().defaultTo(null);
  });
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('tenant_licenses'))) {
    return;
  }
  const hasCol = await knex.schema.hasColumn('tenant_licenses', 'license_key');
  if (!hasCol) {
    return;
  }
  await knex.schema.table('tenant_licenses', (table) => {
    table.dropColumn('license_key');
  });
};
