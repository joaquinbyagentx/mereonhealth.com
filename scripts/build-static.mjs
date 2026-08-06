import { cp, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, 'dist');
const productImages = [
  'bpc-157-10.png', 'cjcipa-5-5.png', 'epithalon-10.png', 'ghkcu-100-10ml.png',
  'glow-70.png', 'ipamorelin-5.png', 'klow-80.png', 'kpv-10.png', 'motsc-10.png',
  'semax-10.png',
  'sermorelin-5.png',
  't-10.png', 'ta1-10.png', 'tb500-5.png', 'tesa-5.png', 'wolverine-10-10.png'
].map((name) => `assets/images/products/${name}`);

// Every production file must be named here. Never replace this with a recursive
// worktree copy: importer inputs, tests, worker source and supplier economics are private.
const PUBLIC_FILES = [
  'CNAME', 'checkout-cancel.html', 'checkout-state.js', 'checkout-success.html',
  'data/catalog.json', 'index.html', 'payment-adapter.js', 'pricing.js', 'script.js',
  'styles.css', 'terminos/index.html', 'privacidad/index.html', 'assets/mark.svg', 'assets/mereon-logo.svg',
  'assets/images/hero-guided-shopping.webp', 'assets/documents/sermorelin-5-coa-2605280407.pdf', ...productImages
];

await rm(output, { recursive: true, force: true });
for (const relativePath of PUBLIC_FILES) {
  const source = join(root, relativePath);
  const sourceStat = await lstat(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`Refusing non-file publish entry: ${relativePath}`);
  }
  const destination = join(output, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  if (relativePath === 'data/catalog.json') {
    const catalog = JSON.parse(await readFile(source, 'utf8'));
    delete catalog.pricingAssumptions;
    await writeFile(destination, `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' });
  } else {
    await cp(source, destination, { dereference: false, errorOnExist: true });
  }
}
console.log(`Built ${PUBLIC_FILES.length} allowlisted static files in dist/`);
