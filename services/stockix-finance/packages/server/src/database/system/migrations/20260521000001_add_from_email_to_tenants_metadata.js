exports.up = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.string('from_email_address').nullable();
    table.string('from_email_name').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table('tenants_metadata', (table) => {
    table.dropColumn('from_email_address');
    table.dropColumn('from_email_name');
  });
};
