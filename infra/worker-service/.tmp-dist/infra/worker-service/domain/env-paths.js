"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultTenantEnvRoot = defaultTenantEnvRoot;
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const config_1 = require("@repo/config");
const isWin = process.platform === "win32";
function defaultTenantEnvRoot() {
    const override = config_1.apiConfig.tenantEnvRoot;
    if (override)
        return override;
    if (isWin)
        return (0, node_path_1.join)((0, node_os_1.homedir)(), ".stockix", "tenants");
    if (config_1.apiConfig.nodeEnv !== "production")
        return (0, node_path_1.join)((0, node_os_1.homedir)(), ".stockix", "tenants");
    return "/opt/stockix/tenants";
}
