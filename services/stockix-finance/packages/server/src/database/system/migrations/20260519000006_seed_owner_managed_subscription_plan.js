exports.up = async function (knex) {
  const existing = await knex('subscription_plans')
    .where({ slug: 'owner-managed' })
    .first();

  if (!existing) {
    await knex('subscription_plans').insert({
      name: 'Owner Managed',
      slug: 'owner-managed',
      price: 0,
      active: true,
      currency: 'USD',
    });
  }
};

exports.down = async function (knex) {
  await knex('subscription_plans').where({ slug: 'owner-managed' }).del();
};
