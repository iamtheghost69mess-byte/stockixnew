const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else if (dirPath.endsWith('.ts') || dirPath.endsWith('.tsx')) {
      callback(dirPath);
    }
  });
}

const targetDir = path.resolve(__dirname, '../apps/pos-frontend2/src');

walkDir(targetDir, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf-8');
  let newContent = content.replace(/from\s+["']@\/components\/ui\/[^"']+["']/g, 'from "@repo/ui-core"');
  newContent = newContent.replace(/from\s+["']@\/components\/ui["']/g, 'from "@repo/ui-core"');
  
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log('Updated: ', filePath);
  }
});
