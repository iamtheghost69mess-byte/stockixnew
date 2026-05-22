import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Determine database path - use data directory in Docker environment
const dbPath = process.env.NODE_ENV === 'production'
  ? join(process.cwd(), 'data', 'pesan-pms.db')
  : 'pesan-pms.db';

// Ensure the data directory exists
const dataDir = dirname(dbPath);
if (!existsSync(dataDir)) {
  try {
    mkdirSync(dataDir, { recursive: true });
    console.log(`Created data directory at ${dataDir}`);
  } catch (error) {
    console.error(`Failed to create data directory: ${error}`);
    // Don't throw, let the Database constructor handle it
  }
}

// Initialize SQLite database with robust error handling
let sqlite;
try {
  // Set journaling mode to WAL for better performance and reliability
  sqlite = new Database(dbPath, {
    verbose: console.log
  });

  // Run PRAGMA statements for better performance
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');

  console.log(`Successfully connected to SQLite database at ${dbPath}`);
} catch (error) {
  console.error(`Failed to initialize SQLite database: ${error}`);
  throw error; // Re-throw to fail fast
}

// Initialize Drizzle ORM
export const db = drizzle(sqlite, { schema });

// Export schema for use in other files
export { schema };
