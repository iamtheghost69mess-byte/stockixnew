// @ts-nocheck
import * as fs from 'fs';
import { promisify } from 'util';
import * as url from 'url';
import { CoreSeeds } from '../../database/seeds/core';

const env = process.env as Record<string, string | undefined>;

const readFile = promisify(fs.readFile);

/**
 * Determines the module type of the given file path.
 * @param {string} filepath
 * @returns {Promise<boolean>}
 */
async function isModuleType(filepath: string): Promise<boolean> {
  if (env.npm_package_json) {
    // npm >= 7.0.0
    const packageJson = JSON.parse(
      await readFile(env.npm_package_json, 'utf-8')
    );
    if (packageJson.type === 'module') {
      return true;
    }
  }
  return env.npm_package_type === 'module' || filepath.endsWith('.mjs');
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
 * Imports the seed module using a webpack-friendly static map.
 * @param {string} moduleName
 * @returns {Promise<any>}
 */
export async function importWebpackSeedModule(moduleName: string): Promise<any> {
  const name = moduleName.replace(/\.ts$/, '');

  if (CoreSeeds[name]) {
    return CoreSeeds[name];
  }

  return import(`../../database/seeds/core/${name}`);
}

/**
 * Returns the list of core seed filenames derived from the static registry.
 * Used as a fallback when the seeds directory is not present on disk
 * (e.g. in a webpack-bundled production deployment).
 * @returns {string[]}
 */
export function getCoreSeederFileNames(): string[] {
  return Object.keys(CoreSeeds).map((name) => `${name}.ts`);
}
