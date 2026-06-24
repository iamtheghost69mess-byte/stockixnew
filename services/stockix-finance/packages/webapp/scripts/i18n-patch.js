const fs = require('fs');
const path = require('path');

const WEBAPP_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(WEBAPP_DIR, 'src');
const LANG_DIR = path.join(SRC_DIR, 'lang');

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

const baseKeys = locales[baseLocale];

// Extract keys used in source code
const extractUsedKeys = (dir) => {
  let keys = new Set();
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fullPath === LANG_DIR) continue;

    if (fs.statSync(fullPath).isDirectory()) {
      keys = new Set([...keys, ...extractUsedKeys(fullPath)]);
    } else if (/\.(ts|tsx|js|jsx)$/.test(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
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

console.log('--- Patching Missing Keys ---');

Object.keys(locales).forEach(lang => {
  if (lang === baseLocale) return;

  const localeData = locales[lang];
  let patchedCount = 0;

  for (const key of usedKeys) {
    if (!localeData[key]) {
      // Use English translation as fallback if available, else format key
      const fallbackValue = baseKeys[key] || key.replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      localeData[key] = fallbackValue;
      patchedCount++;
    }
  }

  if (patchedCount > 0) {
    const jsonPath = path.join(LANG_DIR, lang, 'index.json');
    // Save updated JSON
    fs.writeFileSync(jsonPath, JSON.stringify(localeData, null, 2) + '\n', 'utf8');
    console.log(`[✅] Patched ${patchedCount} missing keys in '${lang}' locale using English fallbacks.`);
  } else {
    console.log(`[ℹ️] Locale '${lang}' has no missing keys.`);
  }
});

console.log('--- Patch Complete ---');
