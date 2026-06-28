const { knexSnakeCaseMappers } = require('./services/stockix-finance/node_modules/objection');
const mappers = knexSnakeCaseMappers({ upperCase: true });

module.exports = {
  client: 'mysql2',
  connection: 'mysql://root:d654586aa6e00642ab2ca0f7b9b1e150@mysql:3306/stockix_system',
  migrations: {
    directory: './services/stockix-finance/packages/server/src/database/system/migrations'
  },
  seeds: {
    directory: './services/stockix-finance/packages/server/src/database/system/seeds'
  },
  postProcessResponse: (result, queryContext) => {
    if (result) {
      const hasLockColumn = (row) => row && (row.is_locked !== undefined || row.IS_LOCKED !== undefined);
      const hasMigrationColumn = (row) => row && (row.migration_time !== undefined || row.MIGRATION_TIME !== undefined || row.name !== undefined || row.NAME !== undefined);
      
      const isInternal = Array.isArray(result) 
        ? (result.length > 0 && (hasLockColumn(result[0]) || hasMigrationColumn(result[0])))
        : (typeof result === 'object' && (hasLockColumn(result) || hasMigrationColumn(result)));

      if (isInternal) {
        // Return Knex internal queries unmodified
        return result;
      }
    }
    return mappers.postProcessResponse(result, queryContext);
  },
  wrapIdentifier: (value, origImpl, queryContext) => {
    if (value.toLowerCase().startsWith('knex_')) {
      return value.toLowerCase();
    }
    return mappers.wrapIdentifier(value, origImpl, queryContext);
  }
};
