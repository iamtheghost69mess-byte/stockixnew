import fs from "fs";
import path from "path";

const targetFile = path.resolve("infra/worker-service/src/provision-runtime.ts");
const outDir = path.resolve("infra/worker-service/src/provisioning-workflows");

let content = fs.readFileSync(targetFile, "utf-8");
const lines = content.split("\n");

function getLineRange(funcName) {
  let start = -1;
  let end = -1;
  let braceCount = 0;
  let inFunc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFunc) {
      if (line.includes(`function ${funcName}(`) || line.includes(`const ${funcName} =`)) {
        start = i;
        inFunc = true;
      }
    }
    
    if (inFunc) {
      for (const char of line) {
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
      }
      if (braceCount === 0 && line.includes('}')) {
        end = i;
        break;
      }
    }
  }
  return { start, end };
}

const functionsToExtract = [
  { name: "runPosProvisionStep", file: "pos-setup.ts" },
  { name: "runWirePosIntegrationStep", file: "pos-setup.ts" },
  { name: "resolvePosBackendHostPort", file: "pos-setup.ts" },
  { name: "persistFinanceDeploymentIds", file: "org-build.ts" },
  { name: "encryptDeploymentSecretLocal", file: "utils.ts" },
  { name: "decryptDeploymentSecretLocal", file: "utils.ts" },
  { name: "rollbackProvision", file: "org-build.ts" },
  { name: "revertAddModuleFailure", file: "org-build.ts" },
  { name: "resolvePublishedServerHostPort", file: "utils.ts" },
  { name: "resolveServerInternalUrl", file: "utils.ts" },
];

const fileContents = {
  "pos-setup.ts": `// Extracted POS functions\nimport { eq } from "drizzle-orm";\nimport { tenantDeployments } from "@repo/db/schema";\nimport { getLicenseExpiry, getPlanLimits } from "../provision-runtime.js";\nimport { provisionPosStackTracked } from "../module-stacks.js";\nimport { getTenantStackPaths, readTenantEnvFile } from "../../domain/provisioning/tenant-env.js";\nimport { resolvePosTenantEnvPath } from "../module-stacks.js";\nimport { join } from "node:path";\nimport { runDockerExec } from "../../domain/provisioning/adapters/execa-docker-compose-runner.js";\nimport { sendPosWelcomeEmail } from "../../domain/provisioning/adapters/send-pos-welcome.js";\nimport { apiConfig } from "@repo/config";\nimport type { PostgresJsDatabase } from "drizzle-orm/postgres-js";\nimport * as dbSchema from "@repo/db/schema";\nimport { createProvisionTracer } from "../../domain/provision-trace.js";\nimport type { PosProvisionOutcome } from "../provision-runtime.js";\n\n`,
  "org-build.ts": `// Extracted org build functions\nimport { eq } from "drizzle-orm";\nimport { tenantDeployments, tenantConfig } from "@repo/db/schema";\nimport { getTenantStackPaths, readTenantEnvFile } from "../../domain/provisioning/tenant-env.js";\nimport { composeProjectName } from "../../domain/provisioning/compose-project-name.js";\nimport { join } from "node:path";\nimport { execa } from "execa";\nimport type { PostgresJsDatabase } from "drizzle-orm/postgres-js";\nimport * as dbSchema from "@repo/db/schema";\n\n`,
  "utils.ts": `// Extracted utility functions\nimport { apiConfig } from "@repo/config";\nimport { encryptDeploymentSecret, decryptDeploymentSecret } from "@repo/shared/deployment-secrets";\n\n`
};

let extractedFunctions = new Set();
let linesToRemove = [];

for (const func of functionsToExtract) {
  const range = getLineRange(func.name);
  if (range.start !== -1 && range.end !== -1) {
    const funcLines = lines.slice(range.start, range.end + 1);
    
    // Add export to function
    if (funcLines[0].trim().startsWith("async function")) {
        funcLines[0] = funcLines[0].replace("async function", "export async function");
    } else if (funcLines[0].trim().startsWith("function")) {
        funcLines[0] = funcLines[0].replace("function", "export function");
    } else if (funcLines[0].trim().startsWith("const")) {
        funcLines[0] = funcLines[0].replace("const", "export const");
    }
    
    fileContents[func.file] += funcLines.join("\n") + "\n\n";
    extractedFunctions.add(func.name);
    
    for (let i = range.start; i <= range.end; i++) {
        linesToRemove.push(i);
    }
  }
}

for (const [filename, content] of Object.entries(fileContents)) {
  fs.writeFileSync(path.join(outDir, filename), content);
}

const newLines = lines.filter((_, idx) => !linesToRemove.includes(idx));

const importLines = `import { runPosProvisionStep, runWirePosIntegrationStep, resolvePosBackendHostPort } from "./provisioning-workflows/pos-setup.js";
import { persistFinanceDeploymentIds, rollbackProvision, revertAddModuleFailure } from "./provisioning-workflows/org-build.js";
import { encryptDeploymentSecretLocal, decryptDeploymentSecretLocal, resolvePublishedServerHostPort, resolveServerInternalUrl } from "./provisioning-workflows/utils.js";
`;

fs.writeFileSync(targetFile, importLines + newLines.join("\n"));

console.log("Extracted functions to provisioning-workflows!");
