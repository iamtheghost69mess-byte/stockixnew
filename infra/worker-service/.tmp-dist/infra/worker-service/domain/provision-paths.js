"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantStackPaths = getTenantStackPaths;
const node_path_1 = require("node:path");
const config_1 = require("@repo/config");
const repo_root_js_1 = require("./repo-root.js");
function getTenantStackPaths() {
    const repoRoot = (0, repo_root_js_1.getRepoRoot)();
    const stockixFinanceRoot = config_1.apiConfig.stockixTenantAppRoot || (0, node_path_1.join)(repoRoot, "services/stockix-finance");
    return {
        repoRoot,
        stockixFinanceRoot,
        tenantComposeFile: (0, node_path_1.join)(repoRoot, "infra/tenant-stack/docker-compose.yml"),
    };
}
