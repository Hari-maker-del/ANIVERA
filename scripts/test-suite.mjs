import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const distHtml = fs.readFileSync(path.resolve('dist/index.html'), 'utf8');
const css = fs.readFileSync(path.resolve('styles.css'), 'utf8');
const js = fs.readFileSync(path.resolve('app.js'), 'utf8');
const cloudSyncJs = fs.readFileSync(path.resolve('cloud-sync.js'), 'utf8');
const sqlMigration = fs.readFileSync(path.resolve('supabase/migrations/20261022000000_anivera_schema.sql'), 'utf8');
const catalogue = JSON.parse(fs.readFileSync(path.resolve('src/data/speciesCatalogue.json'), 'utf8'));

// 1. Brand palette checks
for (const hex of ['#FB8122', '#1D2228', '#FFFFFF', '#E1E2E2']) {
  assert.ok(css.includes(hex), `Missing brand color ${hex} in styles.css`);
}

// 2. Hero headline & required CTAs
assert.ok(distHtml.includes('Every animal. Every stage. Better care.'), 'Missing required hero headline');
for (const label of ['Explore ANIVERA', 'Discover ANIVERA', 'Animal Explorer', 'Animal Categories', 'Lifecycle Workspace', 'About ANIVERA', 'Open Workspace']) {
  assert.ok(distHtml.includes(label), `Missing required navigation/CTA label: ${label}`);
}

// 3. Dual 3D carousel & delta-time animation checks
assert.ok(js.includes('requestAnimationFrame'), 'Missing requestAnimationFrame loop');
assert.ok(!js.includes('mouseenter'), 'Carousel must not pause on mouseenter');
assert.ok(catalogue.length === 142, 'Catalogue must have 142 distinct non-avian species');
const leftCount = catalogue.filter((x) => x.carouselSide === 'left').length;
const rightCount = catalogue.filter((x) => x.carouselSide === 'right').length;
assert.equal(leftCount, 71, 'Left carousel must contain 71 wildlife species');
assert.equal(rightCount, 71, 'Right carousel must contain 71 managed/marine/herp/invertebrate species');

// 4. Supabase migration & schema checks
for (const table of ['animal_profiles', 'health_records', 'care_tasks', 'lifecycle_events', 'workspace_snapshots']) {
  assert.ok(sqlMigration.includes(`CREATE TABLE IF NOT EXISTS public.${table}`), `Missing table ${table} in SQL migration`);
  assert.ok(sqlMigration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`), `Missing RLS enablement for ${table}`);
}

// 5. Execute cloud-sync.js in isolated VM context to test Auth, Persistence & Owner-Scoped RLS
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(cloudSyncJs, sandbox);

const sync = sandbox.AniveraCloudSync;
assert.equal(sync.SUPABASE_PROJECT_ID, 'qbwulpofftxfddlykcxg', 'Supabase Project ID mismatch');
assert.equal(sync.SUPABASE_URL, 'https://qbwulpofftxfddlykcxg.supabase.co', 'Supabase URL mismatch');

// Test invalid credentials rejection
const badAuth = sync.signIn({ email: 'researcher@anivera.org', password: 'wrong-password' });
assert.equal(badAuth.ok, false, 'Invalid password must be rejected');
assert.equal(badAuth.code, 'INVALID_CREDENTIALS', 'Must return INVALID_CREDENTIALS code');

// Test valid sign-in, profile create, reload persistence, profile edit, and RLS cross-user isolation
const goodAuth = sync.signIn({ email: 'researcher@anivera.org', password: 'AniveraCare#2026' });
assert.equal(goodAuth.ok, true, 'Primary user sign-in must succeed');

const ws1 = sync.getOwnerScopedWorkspace();
assert.equal(ws1.ok, true);
assert.equal(ws1.data.profiles.length, 6, 'Primary user seed should have 6 profiles');

ws1.data.profiles.unshift({
  id: 'PRF-TEST-888',
  name: 'Test Iberian Lynx',
  species: 'Iberian Lynx (Lynx pardinus)',
  category: 'Wild Mammals & Wildlife',
  stage: 'Adult',
  tag: 'TAG-ES-888',
  notes: 'Automated test profile'
});
sync.saveOwnerScopedWorkspace(ws1.data);

const wsReload = sync.getOwnerScopedWorkspace();
assert.equal(wsReload.data.profiles.length, 7, 'Created profile must persist across reload');

// Switch to Secondary User and verify Primary User's PRF-TEST-888 is hidden & protected by RLS
sync.signIn({ email: 'sanctuary@anivera.org', password: 'Sanctuary#2026' });
const wsSecondary = sync.getOwnerScopedWorkspace();
assert.equal(wsSecondary.data.profiles.some((p) => p.id === 'PRF-TEST-888'), false, 'Secondary user must not see Primary user private records');
const rlsCheck = sync.verifyRecordOwnership('animal_profiles', 'PRF-TEST-888');
assert.equal(rlsCheck.ok, false, 'RLS ownership check must reject unauthorized user');
assert.equal(rlsCheck.code, 'RLS_VIOLATION', 'RLS check must return RLS_VIOLATION');

// Test expired session detection
const exp = sync.simulateExpiredSession();
assert.equal(exp.ok, false, 'Expired session must return ok: false');
assert.equal(exp.status, 'SESSION_EXPIRED', 'Expired session must report SESSION_EXPIRED');

console.log('TEST SUITE PASS: Brand palette, hero copy, dual 3D carousels, 142-species catalogue, SQL migrations, Authentication, Persistence, and Owner-Scoped RLS assertions succeeded.');
