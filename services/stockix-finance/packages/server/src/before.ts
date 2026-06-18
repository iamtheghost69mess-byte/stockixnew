import path from 'path';
import moment from 'moment';

// Migration files have a .ts extension but contain plain CommonJS JS (no TS syntax).
// Register .ts as an alias for .js via Node's native Module._extensions so Knex
// can require() them. We use require('module')._extensions rather than
// require.extensions because webpack replaces require with its own shim that
// lacks an .extensions property.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NativeModule = require('module');
if (!NativeModule._extensions['.ts']) {
  NativeModule._extensions['.ts'] = NativeModule._extensions['.js'];
}

global.__root_dir = path.join(__dirname, '..');
global.__resources_dir = path.join(global.__root_dir, 'resources');
global.__locales_dir = path.join(global.__resources_dir, 'locales');
global.__views_dir = path.join(global.__root_dir, 'views');

moment.prototype.toMySqlDateTime = function () {
  return this.format('YYYY-MM-DD HH:mm:ss');
};
