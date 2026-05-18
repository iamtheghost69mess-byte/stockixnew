exports.up = function (knex) {
  return knex.schema.table('users', function (table) {
    table.bigInteger('tenant_id').unsigned().nullable().alter();
  });
};

exports.down = function (knex) {
  return knex.schema.table('users', function (table) {
    table.bigInteger('tenant_id').unsigned().notNullable().alter();
  });
};
