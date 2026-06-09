import path from 'path';
import moment from 'moment';

// Register ts-node so Knex can require() TypeScript migration files at runtime.
// This must happen before any Knex connection is created.
try {
  require('ts-node').register({ transpileOnly: true, skipProject: true });
} catch {
  // ts-node not available (e.g. stripped from image) — migrations must be pre-compiled
}

global.__root_dir = path.join(__dirname, '..');
global.__resources_dir = path.join(global.__root_dir, 'resources');
global.__locales_dir = path.join(global.__resources_dir, 'locales');
global.__views_dir = path.join(global.__root_dir, 'views');

moment.prototype.toMySqlDateTime = function () {
  return this.format('YYYY-MM-DD HH:mm:ss');
};
