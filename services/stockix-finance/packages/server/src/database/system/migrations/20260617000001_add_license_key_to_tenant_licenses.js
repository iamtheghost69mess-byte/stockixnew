async function resolveTableName(knex, lower) {
  const upper = lower.toUpperCase();
  if (await knex.schema.hasTable(lower)) return lower;
  if (await knex.schema.hasTable(upper)) return upper;
  return null;
}

exports.up = async function (knex) {
  const table = await resolveTableName(knex, 'tenant_licenses');
  if (!table) return;
  const hasCol = await knex.schema.hasColumn(table, 'license_key')
    || await knex.schema.hasColumn(table, 'LICENSE_KEY');
  if (hasCol) return;
  await knex.schema.table(table, (t) => {
    t.string('license_key', 64).nullable().defaultTo(null);
  });
};

exports.down = async function (knex) {
  const table = await resolveTableName(knex, 'tenant_licenses');
  if (!table) return;
  const hasCol = await knex.schema.hasColumn(table, 'license_key')
    || await knex.schema.hasColumn(table, 'LICENSE_KEY');
  if (!hasCol) return;
  await knex.schema.table(table, (t) => {
    t.dropColumn('license_key');
  });
};
