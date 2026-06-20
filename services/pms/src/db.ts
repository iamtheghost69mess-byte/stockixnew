import { pmsConfig } from "@repo/config";
import { createDb } from "@repo/db";

export const db = pmsConfig.databaseUrl ? createDb(pmsConfig.databaseUrl) : null;
