import type { ITenantEdgePublisher } from "../contracts.js";
export declare class TraefikEdgePublisher implements ITenantEdgePublisher {
    publish(slug: string, port: number, rootDomain: string): Promise<void>;
    unpublish(slug: string): Promise<void>;
}
//# sourceMappingURL=traefik-edge-publisher.d.ts.map