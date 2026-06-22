import fs from "fs";
import path from "path";

const targetFile = path.resolve(
  "infra/worker-service/src/provision-runtime.ts"
);

let content = fs.readFileSync(targetFile, "utf-8");
const lines = content.split("\n");

// Identify ranges for functions
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

for (const func of functionsToExtract) {
  const range = getLineRange(func.name);
  console.log(`Function ${func.name} found at ${range.start + 1} - ${range.end + 1}`);
}
