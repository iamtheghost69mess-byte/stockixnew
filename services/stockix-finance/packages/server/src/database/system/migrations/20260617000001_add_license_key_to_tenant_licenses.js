async function getExactTableName(knex, name) {
  const [rows] = await knex.raw(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND UPPER(TABLE_NAME) = UPPER(?)`,
    [name],
  );
  return rows.length ? rows[0].TABLE_NAME : null;
}

async function columnExists(knex, tableName, columnName) {
  const [rows] = await knex.raw(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND UPPER(COLUMN_NAME) = UPPER(?)`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

exports.up = async function (knex) {
  const table = await getExactTableName(knex, 'tenant_licenses');
  if (!table) return;
  if (await columnExists(knex, table, 'license_key')) return;
  await knex.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`license_key\` VARCHAR(64) NULL DEFAULT NULL`);
};

exports.down = async function (knex) {
  const table = await getExactTableName(knex, 'tenant_licenses');
  if (!table) return;
  if (!(await columnExists(knex, table, 'license_key'))) return;
  await knex.raw(`ALTER TABLE \`${table}\` DROP COLUMN \`license_key\``);
};
