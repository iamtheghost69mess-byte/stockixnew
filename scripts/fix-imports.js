const fs = require('fs');
const path = require('path');

const uiCoreDir = path.join(__dirname, '../packages/ui-core/src');
const files = fs.readdirSync(uiCoreDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

const affectedFiles = [];

for (const file of files) {
  const filePath = path.join(uiCoreDir, file);
  if (fs.statSync(filePath).isDirectory()) continue;
  
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;
  
  if (content.includes('from "./utils"')) {
    content = content.replace(/from "\.\/utils"/g, 'from "./lib/utils"');
    changed = true;
  }
  if (content.includes('from "../lib/utils"')) {
    content = content.replace(/from "\.\.\/lib\/utils"/g, 'from "./lib/utils"');
    changed = true;
  }
  
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf-8');
    affectedFiles.push(file);
  }
}

console.log("Fixed ui-core imports in:", affectedFiles.join(', '));

// Also fix ui-shared/shell
const shellDir = path.join(__dirname, '../packages/ui-shared/src/shell');
if (fs.existsSync(shellDir)) {
  const shellFiles = fs.readdirSync(shellDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
  const shellAffected = [];
  for (const file of shellFiles) {
    const filePath = path.join(shellDir, file);
    if (fs.statSync(filePath).isDirectory()) continue;
    
    let content = fs.readFileSync(filePath, 'utf-8');
    let changed = false;
    
    // Replace import { X } from "../components/x" -> import { X } from "@repo/ui-core"
    if (content.match(/from "\.\.\/components\/[^"]+"/g)) {
      content = content.replace(/from "\.\.\/components\/[^"]+"/g, 'from "@repo/ui-core"');
      changed = true;
    }
    // Replace import { X } from "../lib/utils" -> import { X } from "@repo/ui-core"
    if (content.includes('from "../lib/utils"')) {
      content = content.replace(/from "\.\.\/lib\/utils"/g, 'from "@repo/ui-core"');
      changed = true;
    }
    
    if (changed) {
      fs.writeFileSync(filePath, content, 'utf-8');
      shellAffected.push(file);
    }
  }
  console.log("Fixed ui-shared/shell imports in:", shellAffected.join(', '));
}
