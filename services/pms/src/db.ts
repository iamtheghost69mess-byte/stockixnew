import { pmsConfig } from "@repo/config";
import { createPmsDb } from "@repo/pms-db";

export const db = pmsConfig.databaseUrl ? createPmsDb(pmsConfig.databaseUrl) : null;
