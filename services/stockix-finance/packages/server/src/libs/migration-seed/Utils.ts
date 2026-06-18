import * as fs from 'fs';
import * as path from 'path';
import { CoreTenantSeeds } from '@/database/tenant/seeds/core';

/**
 * Detarmines the module type of the given file path.
 * @param {string} filepath
 * @returns {boolean}
 */
async function isModuleType(filepath: string): boolean {
  if (process.env.npm_package_json) {
    const { promisify } = require('util');
    const readFile = promisify(fs.readFile);
    // npm >= 7.0.0
    const packageJson = JSON.parse(
      await readFile(process.env.npm_package_json, 'utf-8'),
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
 * @returns
 */
export async function importFile(filepath: string): any {
  return (await isModuleType(filepath))
    ? import(require('url').pathToFileURL(filepath))
    : require(filepath);
}

/**
 *
 * @param {string} moduleName
 * @param {string} seedsDirectory - The seeds directory path from config
 * @returns
 */
export async function importWebpackSeedModule(
  moduleName: string,
  seedsDirectory: string,
): any {
  // CoreTenantSeeds is a statically-imported map of all tenant seed modules.
  // Static imports are bundled by webpack at build time — no dynamic require() needed,
  // which avoids the webpackEmptyContext error caused by dynamic template-literal imports.
  const name = moduleName.replace(/\.ts$/, '');
  if (CoreTenantSeeds[name]) {
    return CoreTenantSeeds[name];
  }
  throw new Error(`Tenant seed module not found in registry: ${moduleName}`);
}
