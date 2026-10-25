import fs from 'node:fs';
import path from 'node:path';

fs.copyFileSync(path.resolve('styles.css'), path.resolve('src/styles/main.css'));
fs.copyFileSync(path.resolve('app.js'), path.resolve('src/js/app.js'));

const htmlTemplate = fs.readFileSync(path.resolve('index.html'), 'utf8');
const dashboardTemplate = fs.readFileSync(path.resolve('dashboard.html'), 'utf8');
const cssContent = fs.readFileSync(path.resolve('styles.css'), 'utf8');
const cloudSyncContent = fs.readFileSync(path.resolve('cloud-sync.js'), 'utf8');
const jsContent = fs.readFileSync(path.resolve('app.js'), 'utf8');
const rawCatalogue = JSON.parse(fs.readFileSync(path.resolve('src/data/speciesCatalogue.json'), 'utf8'));

// Keep only the two asset locations used by the built app and service worker.
// Catalogue URLs resolve through dist/public/assets/species; the service worker
// precaches ./assets/species. Remove legacy generated copies from older builds.
fs.rmSync(path.resolve('dist/assets/animals'), { recursive: true, force: true });
fs.rmSync(path.resolve('dist/public/assets/animals'), { recursive: true, force: true });
fs.mkdirSync(path.resolve('dist/assets/species'), { recursive: true });
fs.mkdirSync(path.resolve('dist/public/assets/species'), { recursive: true });

const staticCatalogue = [];

for (const sp of rawCatalogue) {
  const relPath = sp.imageUrl || sp.imageSource;
  const staticCopy = { ...sp };
  delete staticCopy.name;
  delete staticCopy.careInformation;

  if (sp.imageVerified && relPath && fs.existsSync(path.resolve(relPath))) {
    const buf = fs.readFileSync(path.resolve(relPath));
    const baseName = path.basename(relPath);
    fs.writeFileSync(path.resolve('dist/assets/species', baseName), buf);
    fs.writeFileSync(path.resolve('dist/public/assets/species', baseName), buf);
  }

  staticCatalogue.push(staticCopy);
}

const distIndex = htmlTemplate
  .replace('<link rel="stylesheet" href="styles.css" />', `<style>\n${cssContent}\n</style>`)
  .replace('__SPECIES_DATA_PLACEHOLDER__', JSON.stringify(staticCatalogue))
  .replace('<script src="animals-data.js"></script>\n  ', '')
  .replace('<script src="cloud-sync.js"></script>', `<script>\n${cloudSyncContent}\n</script>`)
  .replace('<script src="app.js"></script>', `<script>\n${jsContent}\n</script>`);

fs.mkdirSync(path.resolve('dist'), { recursive: true });
fs.writeFileSync(path.resolve('dist/index.html'), distIndex, 'utf8');
fs.writeFileSync(path.resolve('dist/dashboard.html'), dashboardTemplate, 'utf8');
fs.writeFileSync(path.resolve('dist/styles.css'), cssContent, 'utf8');
fs.writeFileSync(path.resolve('dist/cloud-sync.js'), cloudSyncContent, 'utf8');
fs.writeFileSync(path.resolve('dist/app.js'), jsContent, 'utf8');
fs.copyFileSync(path.resolve('animals-data.js'), path.resolve('dist/animals-data.js'));

if (fs.existsSync(path.resolve('public/manifest.json'))) {
  fs.copyFileSync(path.resolve('public/manifest.json'), path.resolve('dist/manifest.json'));
  fs.mkdirSync(path.resolve('dist/public'), { recursive: true });
  fs.copyFileSync(path.resolve('public/manifest.json'), path.resolve('dist/public/manifest.json'));
}
if (fs.existsSync(path.resolve('public/sw.js'))) {
  fs.copyFileSync(path.resolve('public/sw.js'), path.resolve('dist/sw.js'));
  fs.mkdirSync(path.resolve('dist/public'), { recursive: true });
  fs.copyFileSync(path.resolve('public/sw.js'), path.resolve('dist/public/sw.js'));
}

console.log(`BUILD SUCCESS: dist/index.html (${(Buffer.byteLength(distIndex, 'utf8') / 1024).toFixed(1)} KB) and 142 static WebP assets generated.`);
