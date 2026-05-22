import { execa } from "execa";

import { REQUIRED_STOCKIX_TENANT_IMAGES } from "./required-tenant-images.js";

async function imageExists(tag: string): Promise<boolean> {
  try {
    await execa("docker", ["image", "inspect", tag], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Warn at worker startup when Finance images were not pre-built (provision may be slow). */
export async function checkRequiredTenantImages(): Promise<void> {
  const missing: string[] = [];
  for (const image of REQUIRED_STOCKIX_TENANT_IMAGES) {
    if (!(await imageExists(image))) {
      missing.push(image);
    }
  }
  if (missing.length > 0) {
    console.warn("[worker] WARNING: Required tenant images not found:");
    for (const img of missing) {
      console.warn(`[worker]   - ${img}`);
    }
    console.warn("[worker] Run: pnpm docker:prebuild");
    console.warn("[worker] Provisioning may build images during the job and time out.");
    return;
  }
  console.log("[worker] All tenant images pre-built and ready.");
}
