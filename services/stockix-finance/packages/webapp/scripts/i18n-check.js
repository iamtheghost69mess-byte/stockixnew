const fs = require('fs');
const path = require('path');

const WEBAPP_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(WEBAPP_DIR, 'src');
const LANG_DIR = path.join(SRC_DIR, 'lang');

// Output report path
const REPORT_PATH = path.join(WEBAPP_DIR, 'i18n-report.md');

// 1. Load all locales
const locales = {};
const langFolders = fs.readdirSync(LANG_DIR).filter(f => fs.statSync(path.join(LANG_DIR, f)).isDirectory());

langFolders.forEach(lang => {
  const jsonPath = path.join(LANG_DIR, lang, 'index.json');
  if (fs.existsSync(jsonPath)) {
    locales[lang] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }
});

const baseLocale = 'en';
if (!locales[baseLocale]) {
  console.error(`Base locale '${baseLocale}' not found.`);
  process.exit(1);
}

const baseKeys = Object.keys(locales[baseLocale]);

// 2. Extract keys used in source code
const extractUsedKeys = (dir) => {
  let keys = new Set();
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    
    // Ignore lang dir to not scan json files or other generated stuff if any
    if (fullPath === LANG_DIR) continue;

    if (fs.statSync(fullPath).isDirectory()) {
      keys = new Set([...keys, ...extractUsedKeys(fullPath)]);
    } else if (/\.(ts|tsx|js|jsx)$/.test(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Match intl.get('key'), intl.get("key"), intl.getHTML('key'), intl.getHTML("key")
      const regex = /intl\.(?:get|getHTML)\(\s*['"]([^'"]+)['"]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        keys.add(match[1]);
      }
    }
  }
  return keys;
};

const usedKeys = extractUsedKeys(SRC_DIR);
let hasErrors = false;

let reportMarkdown = `# i18n Translation Audit Report\n\n`;
reportMarkdown += `**Total unique keys used in source code:** ${usedKeys.size}\n\n`;

reportMarkdown += `## 1. Missing Keys in Source Code\n\n`;
reportMarkdown += `The following languages are missing keys that are actively used in the frontend code (\`intl.get(...)\`).\n\n`;

Object.keys(locales).forEach(lang => {
  const langKeys = new Set(Object.keys(locales[lang]));
  const missingInCode = [];
  
  for (const key of usedKeys) {
    if (!langKeys.has(key)) {
      missingInCode.push(key);
    }
  }

  if (missingInCode.length > 0) {
    reportMarkdown += `### ❌ Locale: \`${lang}\` (${missingInCode.length} keys missing)\n`;
    reportMarkdown += '```text\n';
    missingInCode.forEach(k => reportMarkdown += `${k}\n`);
    reportMarkdown += '```\n\n';
    hasErrors = true;
  } else {
    reportMarkdown += `### ✅ Locale: \`${lang}\`\nHas all keys used in code.\n\n`;
  }
});

reportMarkdown += `## 2. Missing Parity with Base Locale (\`${baseLocale}\`)\n\n`;
reportMarkdown += `The following languages are missing keys that exist in the base English dictionary. (These might be unused keys, but they indicate incomplete translation files).\n\n`;

Object.keys(locales).forEach(lang => {
  if (lang === baseLocale) return;

  const langKeys = new Set(Object.keys(locales[lang]));
  const missingFromBase = [];

  for (const key of baseKeys) {
    if (!langKeys.has(key)) {
      missingFromBase.push(key);
    }
  }

  if (missingFromBase.length > 0) {
    reportMarkdown += `### ⚠️ Locale: \`${lang}\` (${missingFromBase.length} keys missing compared to \`en\`)\n`;
    reportMarkdown += '```text\n';
    missingFromBase.forEach(k => reportMarkdown += `${k}\n`);
    reportMarkdown += '```\n\n';
  } else {
    reportMarkdown += `### ✅ Locale: \`${lang}\`\nPerfectly in sync with \`${baseLocale}\`.\n\n`;
  }
});

fs.writeFileSync(REPORT_PATH, reportMarkdown, 'utf8');

console.log(`Audit complete. Report generated at: ${REPORT_PATH}`);

if (hasErrors) {
  process.exit(1);
} else {
  process.exit(0);
}
