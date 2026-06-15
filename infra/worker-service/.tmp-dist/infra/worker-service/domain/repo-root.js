"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRepoRoot = getRepoRoot;
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
const node_fs_1 = require("node:fs");
const config_1 = require("@repo/config");
function getRepoRoot() {
    const override = config_1.apiConfig.repoRoot;
    if (override)
        return override;
    const here = (0, node_path_1.dirname)((0, node_url_1.fileURLToPath)(import.meta.url));
    const candidate = (0, node_path_1.join)(here, "..", "..", "..");
    if ((0, node_fs_1.existsSync)((0, node_path_1.join)(candidate, "package.json"))) {
        return candidate;
    }
    // Backward-compatible fallback for unexpected layouts.
    return (0, node_path_1.join)(here, "..", "..", "..", "..");
}
