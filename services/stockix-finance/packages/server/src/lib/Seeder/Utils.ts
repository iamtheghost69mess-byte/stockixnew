// @ts-nocheck
import * as fs from 'fs';
import { promisify } from 'util';
import * as url from 'url';

const readFile = promisify(fs.readFile);

/**
 * Determines the module type of the given file path.
 * @param {string} filepath
 * @returns {Promise<boolean>}
 */
async function isModuleType(filepath: string): Promise<boolean> {
  if (process.env.npm_package_json) {
    // npm >= 7.0.0
    const packageJson = JSON.parse(
      await readFile(process.env.npm_package_json, 'utf-8')
    );
    if (packageJson.type === 'module') {
      return true;
    }
  }
  return process.env.npm_package_type === 'module' || filepath.endsWith('.mjs');
}

/**
 * Imports content of the given file path.
 * @param {string} filepath
 * @returns {Promise<any>}
 */
export async function importFile(filepath: string): Promise<any> {
  return (await isModuleType(filepath))
    ? import(url.pathToFileURL(filepath).toString())
    : require(filepath);
}

/**
 * Imports the seed module using a webpack-friendly dynamic path.
 * @param {string} moduleName
 * @returns {Promise<any>}
 */
export async function importWebpackSeedModule(moduleName: string): Promise<any> {
  // Use relative path to help webpack create a context for the seeds directory.
  // We strip the .ts extension so Webpack's resolver can find the matching module.
  const name = moduleName.replace(/\.ts$/, '');
  
  // NOTE: This MUST be a relative path that Webpack can resolve at build time.
  // src/lib/Seeder/Utils.ts -> src/database/seeds/core
  return import(`../../database/seeds/core/${name}`);
}
