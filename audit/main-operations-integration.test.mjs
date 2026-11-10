import test from 'node:test';
import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';

const root = new URL('../ESTRUCTURA%20DE%20ARCHIVOS/SAFI-WEBSITE/', import.meta.url);
const required = [
  'operations/index.html',
  'operations/staging-dashboard.html',
  'operations/staging-finance.html',
  'operations/staging-invoice.html',
  'operations/staging-expenses.html',
  'operations/staging-accounting.html',
  'operations/staging-projects.html',
  'operations/staging-labor.html',
  'operations/staging-flha.html',
  'operations/staging-worker-mobile.html',
  'operations/staging-field-transfer.html',
  'operations/staging-worker-corrections.html',
  'operations/staging-correction-review-local.html',
  'operations/finance-core.mjs',
  'operations/accounting-core.mjs',
  'operations/field-correction-client.mjs'
];

test('main SAFI website contains integrated operations workspace', async () => {
  for (const path of required) await access(new URL(path, root));
  const hub = await readFile(new URL('operations/index.html', root), 'utf8');
  assert.match(hub, /SAFI Operations Hub/);
  assert.match(hub, /href="\.\.\/admin-dashboard\.html"/);
  assert.match(hub, /staging-worker-mobile\.html/);
  assert.match(hub, /staging-accounting\.html/);
  assert.doesNotMatch(hub, /firebase-config\.js|initializeApp\s*\(/);
});

test('production admin page has visible Operations Hub entry points', async () => {
  const admin = await readFile(new URL('admin-dashboard.html', root), 'utf8');
  const links = admin.match(/href="operations\/index\.html"/g) || [];
  assert.ok(links.length >= 3, 'Admin dashboard should expose Operations Hub in actions, nav and content');
  assert.match(admin, />Operations Hub</);
  assert.match(admin, /Open Operations Hub/);
});
