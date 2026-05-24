"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraefikEdgePublisher = void 0;
const traefik_config_js_1 = require("../../traefik-config.js");
class TraefikEdgePublisher {
    async publish(slug, port, rootDomain) {
        await (0, traefik_config_js_1.writeTenantTraefikConfig)(slug, port, rootDomain);
    }
    async unpublish(slug) {
        await (0, traefik_config_js_1.removeTenantTraefikConfig)(slug);
    }
}
exports.TraefikEdgePublisher = TraefikEdgePublisher;
