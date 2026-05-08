"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantProvisionService = void 0;
const provision_runtime_js_1 = require("../../src/provision-runtime.js");
class TenantProvisionService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async provision(db, input, log, correlationId, assertNotCancelled) {
        return (0, provision_runtime_js_1.executeProvisionRuntime)(this.deps, db, input, log, correlationId, assertNotCancelled);
    }
}
exports.TenantProvisionService = TenantProvisionService;
