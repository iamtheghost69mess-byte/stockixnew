// @ts-nocheck
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const nativeRequire = createRequire(__filename);

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
  const seedsDirAbsolute = path.isAbsolute(seedsDirectory)
    ? seedsDirectory
    : path.resolve(process.cwd(), seedsDirectory);

  const jsPath = path.join(seedsDirAbsolute, `${moduleName}.js`);
  const tsPath = path.join(seedsDirAbsolute, `${moduleName}.ts`);

  if (fs.existsSync(jsPath)) {
    return nativeRequire(jsPath);
  }
  if (fs.existsSync(tsPath)) {
    return nativeRequire(tsPath);
  }
  throw new Error(
    `Cannot find seed module ${moduleName} in ${seedsDirAbsolute}`,
  );
}
