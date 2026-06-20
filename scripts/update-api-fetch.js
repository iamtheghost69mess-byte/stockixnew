const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(filePath);
    }
  });
  return results;
}

const files = walk('./apps/dashboard/app/api');
let changedCount = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  content = content.replace(/apiFetch\((["`])\/(?!v1\/)/g, 'apiFetch($1/v1/');
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedCount++;
    console.log('Updated', file);
  }
}
console.log('Total files updated:', changedCount);
