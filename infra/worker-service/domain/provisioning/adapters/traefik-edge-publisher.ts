import type { ITenantEdgePublisher } from "../contracts.js";
import { removeTenantTraefikConfig, writeTenantTraefikConfig } from "../../traefik-config.js";

export class TraefikEdgePublisher implements ITenantEdgePublisher {
  async publish(slug: string, port: number, rootDomain: string, composeProjectName?: string): Promise<void> {
    await writeTenantTraefikConfig(slug, port, rootDomain, composeProjectName);
  }
  async unpublish(slug: string): Promise<void> {
    await removeTenantTraefikConfig(slug);
  }
}
