import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const publishRoot = join(root, 'dist');
const productImages = [
  'bpc-157-10.png', 'cjcipa-5-5.png', 'epithalon-10.png', 'ghkcu-100-10ml.png',
  'glow-70.png', 'ipamorelin-5.png', 'klow-80.png', 'kpv-10.png', 'motsc-10.png',
  'semax-10.png',
  'sermorelin-5.png',
  't-10.png', 'ta1-10.png', 'tb500-5.png', 'tesa-5.png', 'wolverine-10-10.png'
].map((name) => `assets/images/products/${name}`);
const expectedFiles = [
  'CNAME', 'checkout-cancel.html', 'checkout-state.js', 'checkout-success.html',
  'data/catalog.json', 'index.html', 'payment-adapter.js', 'pricing.js', 'script.js',
  'styles.css', 'terminos/index.html', 'privacidad/index.html', 'assets/mark.svg', 'assets/mereon-logo.svg',
  'assets/images/hero-guided-shopping.webp', 'assets/documents/sermorelin-5-coa-2605280407.pdf', ...productImages
].sort();

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [relative(publishRoot, path)];
  });
}

test('production static build publishes only the exact storefront allowlist', () => {
  execFileSync(process.execPath, ['scripts/build-static.mjs'], { cwd: root, stdio: 'pipe' });
  const actual = filesBelow(publishRoot).sort();
  assert.deepEqual(actual, expectedFiles);

  for (const internalPath of ['legal/TERMINOS.md', 'legal/AVISO-DE-PRIVACIDAD.md', 'scripts/import_catalog.py', 'tests/importer_test.py', 'worker/src/catalog.js', 'docs/checkout-runbook.md', 'package.json', 'wrangler.jsonc']) {
    assert.equal(actual.includes(internalPath), false, `${internalPath} must not be publishable`);
  }

  const publishedText = actual
    .filter((path) => /\.(?:html|js|json|css|svg)$/.test(path))
    .map((path) => readFileSync(join(publishRoot, path), 'utf8'))
    .join('\n');
  assert.doesNotMatch(publishedText, /SUPPLIER_ORDER|unitUsdCents|LANDED_UPLIFT|TARGET_PROFIT|profitMarkup|landedUplift|supplier order|supplier cost|profit markup|markup basis|landed uplift|uplift basis|33332|(?:17\.2317|172317|17\.3288|173288).{0,80}(?:1\.13|11300).{0,80}(?:1\.40|14000)/is);
  const publishedCatalog = JSON.parse(readFileSync(join(publishRoot, 'data/catalog.json'), 'utf8'));
  assert.equal('pricingAssumptions' in publishedCatalog, false, 'FX and pricing assumptions must remain internal');
  assert.doesNotMatch(publishedText, /fxMxnTenThousandthsPerUsd|fxSourceDate|fxSourceUrl|172317|17\.2317|173288|17\.3288/i);
  assert.match(readFileSync(join(publishRoot, 'terminos/index.html'), 'utf8'), /Aviso importante \(Research Use Only — RUO\)/);
  assert.match(readFileSync(join(publishRoot, 'privacidad/index.html'), 'utf8'), /5\. Derechos ARCO/);
});
