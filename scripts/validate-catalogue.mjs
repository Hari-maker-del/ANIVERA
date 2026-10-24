import fs from 'node:fs';
import path from 'node:path';
import { ANIVERA_ANIMALS_DATA } from '../animals-data.js';

const cataloguePath = path.resolve('src/data/speciesCatalogue.json');
const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));

const ALLOWED_CATEGORIES = new Set([
  'Wild Mammals & Wildlife',
  'Livestock & Farm Animals',
  'Companion Animals',
  'Marine Mammals',
  'Fish',
  'Reptiles',
  'Amphibians',
  'Invertebrates'
]);

const FORBIDDEN_AVIAN_REGEX = /\b(aves|bird|birds|avian|eagle|hawk|falcon|owl|parrot|macaw|penguin|ostrich|flamingo|sparrow|pigeon|dove|peacock|peafowl|swan|duck|goose|chicken|rooster|turkey|quail|canary|finch|cockatoo|toucan|hornbill|pelican|albatross|heron|stork|crane|hummingbird|kingfisher|woodpecker|crow|raven|magpie|gull)\b/i;

const REQUIRED_FIELDS = [
  'id',
  'name',
  'commonName',
  'scientificName',
  'taxonomicClass',
  'category',
  'animalType',
  'carouselSide',
  'imageUrl',
  'imageSource',
  'imageAttribution',
  'description',
  'habitat',
  'diet',
  'lifespan',
  'conservationStatus',
  'lifecycleCharacteristics',
  'careInformation',
  'lifecycleCare'
];

const ids = new Set();
const commonNames = new Set();
const sciNames = new Set();
const errors = [];
let verifiedAssetsCount = 0;

if (ANIVERA_ANIMALS_DATA.length !== catalogue.length) {
  errors.push(`Mismatch between animals-data.js (${ANIVERA_ANIMALS_DATA.length}) and speciesCatalogue.json (${catalogue.length})`);
}

for (const item of catalogue) {
  if (ids.has(item.id)) errors.push(`Duplicate ID: ${item.id}`);
  ids.add(item.id);

  const cn = (item.name || item.commonName || '').trim().toLowerCase();
  if (commonNames.has(cn)) errors.push(`Duplicate commonName: ${item.name || item.commonName}`);
  commonNames.add(cn);

  const sn = (item.scientificName || '').trim().toLowerCase();
  if (sciNames.has(sn)) errors.push(`Duplicate scientificName: ${item.scientificName}`);
  sciNames.add(sn);

  for (const field of REQUIRED_FIELDS) {
    if (!String(item[field] || '').trim()) {
      errors.push(`Missing required field '${field}' on ${item.id}`);
    }
  }

  if (!ALLOWED_CATEGORIES.has(item.category)) {
    errors.push(`Invalid category '${item.category}' on ${item.id}`);
  }

  if (item.carouselSide !== 'left' && item.carouselSide !== 'right') {
    errors.push(`Invalid carouselSide '${item.carouselSide}' on ${item.id}`);
  }

  const combined = `${item.name} ${item.commonName} ${item.scientificName} ${item.taxonomicClass} ${item.category} ${item.animalType} ${item.description} ${item.diet}`;
  if (item.taxonomicClass.toLowerCase() === 'aves' || FORBIDDEN_AVIAN_REGEX.test(combined)) {
    errors.push(`Bird/Avian record detected on ${item.id} (${item.commonName})`);
  }

  if (item.imageVerified) {
    verifiedAssetsCount++;
    const assetPath = path.resolve(item.imageUrl || item.imageSource);
    if (!fs.existsSync(assetPath)) {
      errors.push(`Broken local image asset '${item.imageUrl}' on ${item.id}`);
    }
  }
}

if (catalogue.length < 120) {
  errors.push(`Expected at least 120 distinct species, found ${catalogue.length}`);
}

if (errors.length > 0) {
  console.error('Catalogue Validation Failed:\n' + errors.join('\n'));
  process.exit(1);
}

console.log(`PASS: Validated ${catalogue.length} non-avian species across animals-data.js & speciesCatalogue.json (0 duplicate IDs, 0 duplicate common/scientific names, 0 bird records, ${verifiedAssetsCount} verified local WebP photographs).`);
