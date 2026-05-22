exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('tenant_licenses'))) {
    return;
  }
  const hasMaxActivations = await knex.schema.hasColumn(
    'tenant_licenses',
    'max_activations',
  );
  if (hasMaxActivations) {
    return;
  }
  await knex.schema.table('tenant_licenses', (table) => {
    table.integer('max_activations').notNullable().defaultTo(1);
  });

  await knex('tenant_licenses').update({
    max_activations: knex.ref('max_users'),
  });

  await knex('tenant_licenses').update({
    max_users: 999,
  });
};

exports.down = async function (knex) {
  await knex('tenant_licenses').update({
    max_users: knex.ref('max_activations'),
  });

  await knex.schema.table('tenant_licenses', (table) => {
    table.dropColumn('max_activations');
  });
};
