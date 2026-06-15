exports.up = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.string('secondary_currency', 3).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.dropColumn('secondary_currency');
  });
};
