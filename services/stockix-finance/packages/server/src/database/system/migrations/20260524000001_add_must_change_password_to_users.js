exports.up = function (knex) {
  return knex.schema.table('users', (table) => {
    table.boolean('must_change_password').notNullable().defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.table('users', (table) => {
    table.dropColumn('must_change_password');
  });
};
