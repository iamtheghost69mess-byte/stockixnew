exports.up = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.text('display_currencies').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.dropColumn('display_currencies');
  });
};
