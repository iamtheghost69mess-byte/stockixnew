import { dbConfig } from "@repo/config";
import { createDb } from "@repo/db";

export const db = dbConfig.databaseUrl ? createDb(dbConfig.databaseUrl) : null;
