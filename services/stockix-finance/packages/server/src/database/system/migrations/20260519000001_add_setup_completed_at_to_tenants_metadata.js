exports.up = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.timestamp('setup_completed_at').nullable().defaultTo(null);
  });
};

exports.down = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.dropColumn('setup_completed_at');
  });
};
