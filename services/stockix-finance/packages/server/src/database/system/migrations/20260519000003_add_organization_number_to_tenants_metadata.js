exports.up = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.string('organization_number', 20).unique().nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.dropColumn('organization_number');
  });
};
