/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const existing = await knex('pdf_templates')
    .where({ resource: 'Bill' })
    .first();

  if (existing) {
    return;
  }

  return knex('pdf_templates').insert({
    resource: 'Bill',
    templateName: 'Standard Template',
    predefined: true,
    default: true,
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  return knex('pdf_templates').where({ resource: 'Bill' }).delete();
};
