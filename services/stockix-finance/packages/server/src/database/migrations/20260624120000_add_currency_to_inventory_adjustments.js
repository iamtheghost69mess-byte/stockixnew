exports.up = function (knex) {
  return knex.schema.table('inventory_adjustments', (table) => {
    table.string('currency_code').nullable().after('description');
    table.decimal('exchange_rate', 13, 4).defaultTo(1).after('currency_code');
  });
};

exports.down = function (knex) {
  return knex.schema.table('inventory_adjustments', (table) => {
    table.dropColumn('exchange_rate');
    table.dropColumn('currency_code');
  });
};
