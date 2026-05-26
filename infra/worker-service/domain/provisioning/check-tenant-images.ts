import { execa } from "execa";

import {
  POS_FRONTEND_STUB_LABEL,
  RECOMMENDED_POS_TENANT_IMAGES,
  REQUIRED_STOCKIX_TENANT_IMAGES,
} from "./required-tenant-images.js";

export async function imageExists(tag: string): Promise<boolean> {
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

  const missingPos: string[] = [];
  for (const image of RECOMMENDED_POS_TENANT_IMAGES) {
    if (!(await imageExists(image))) {
      missingPos.push(image);
    }
  }
  if (missingPos.length > 0) {
    console.warn("[worker] POS module images not pre-built (POS provision will fail until built):");
    for (const img of missingPos) {
      console.warn(`[worker]   - ${img}`);
    }
    console.warn("[worker] Run: pnpm pos:images:build");
    return;
  }

  if (await isPosFrontendStubImage()) {
    console.warn(
      "[worker] stockix-pos-frontend:local is the nginx STUB (shows 'POS frontend placeholder').",
    );
    console.warn("[worker] Rebuild real UI: pnpm pos:images:build -- --force");
  }
}

/** Fail fast before compose so provision does not trigger slow implicit image builds. */
export async function assertRequiredTenantImages(): Promise<void> {
  const missing: string[] = [];
  for (const image of REQUIRED_STOCKIX_TENANT_IMAGES) {
    if (!(await imageExists(image))) {
      missing.push(image);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Required tenant images missing: ${missing.join(", ")}. Run: pnpm docker:prebuild`,
    );
  }
}

export async function isPosFrontendStubImage(
  tag = "stockix-pos-frontend:local",
): Promise<boolean> {
  if (!(await imageExists(tag))) {
    return false;
  }
  try {
    const { stdout } = await execa(
      "docker",
      [
        "image",
        "inspect",
        "--format",
        `{{index .Config.Labels "${POS_FRONTEND_STUB_LABEL}"}}`,
        tag,
      ],
      { stdio: "pipe" },
    );
    return stdout.trim() === "pos-frontend-stub";
  } catch {
    return false;
  }
}
