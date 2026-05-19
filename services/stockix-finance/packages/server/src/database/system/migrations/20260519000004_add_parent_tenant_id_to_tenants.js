exports.up = function (knex) {
  return knex.schema.table('tenants', (table) => {
    table
      .bigInteger('parent_tenant_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('tenants')
      .onDelete('SET NULL');
  });
};

exports.down = function (knex) {
  return knex.schema.table('tenants', (table) => {
    table.dropColumn('parent_tenant_id');
  });
};
