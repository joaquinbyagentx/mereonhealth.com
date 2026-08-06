import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalogFixture = JSON.parse(readFileSync(new URL('../../data/catalog.json', import.meta.url), 'utf8'));
const isSellable = (product) => product.purchaseEnabled === true && product.stockQuantity > 0;
const liveProducts = catalogFixture.products.filter(isSellable).map((product) => ({ code: product.code, name: product.name, unitAmount: product.basePriceCentavos, available: product.stockQuantity }));

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.route('https://api.mereonhealth.com/v1/catalog', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ currency: 'mxn', products: liveProducts }) }));
});

async function trackRuntimeFailures(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === '127.0.0.1' && response.status() >= 400) {
      errors.push(`response ${response.status()}: ${url.pathname}`);
    }
  });
  return errors;
}

test('responsive catalog has no runtime errors or horizontal overflow', async ({ page }) => {
  const errors = await trackRuntimeFailures(page);
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(16);
  await expect(page.locator('.product-card .product-card__research-area')).toHaveCount(16);
  await expect(page.locator('.product-card .mereon-verified-badge')).toHaveCount(liveProducts.length);
  await expect(page.locator('[data-catalog-status]')).toContainText('16 de 16');
  const catalogPayload = await page.request.get('/data/catalog.json').then((response) => response.json());
  for (const product of catalogPayload.products) {
    const card = page.locator(`.product-card:has([data-detail="${product.code}"])`);
    await expect(card.locator('.product-card__research-area')).toHaveText(product.researchArea);
  }
  const tirzepatidaCard = page.locator('.product-card:has([data-detail="T-10"])');
  await expect(tirzepatidaCard.locator('h3')).toHaveText('Tirzepatida (T-10)');
  await expect(tirzepatidaCard.locator('.product-card__research-area')).toHaveText('Agonismo dual GIP/GLP-1 y metabolismo');
  const clarification = 'Las descripciones presentan áreas estudiadas en investigación preclínica y no establecen eficacia, seguridad ni una indicación terapéutica. Los materiales ofrecidos por Mereon son exclusivamente para investigación.';
  await expect(page.getByText(clarification, { exact: true })).toHaveCount(1);
  const faqItems = page.locator('.faq__items > details');
  await expect(faqItems).toHaveCount(4);
  await expect(faqItems.last().locator('summary')).toHaveText('¿Qué significa “péptido de investigación”?');
  await expect(faqItems.last().locator('p')).toHaveText([
    'Algunas moléculas de nuestro catálogo continúan siendo estudiadas por la comunidad científica en etapas preclínicas o clínicas. Otras comparten ingredientes activos con medicamentos ya autorizados en determinadas presentaciones y jurisdicciones.',
    'La clasificación de investigación corresponde específicamente al material ofrecido por Mereon y no implica registro sanitario, equivalencia farmacéutica ni aprobación para una indicación terapéutica. Consulta la ficha técnica y la documentación de cada producto para conocer su condición particular.'
  ]);
  const researchTrigger = page.getByRole('button', { name: '¿Qué significa?' });
  await expect(researchTrigger).toBeVisible();
  await researchTrigger.click();
  const researchDialog = page.locator('[data-research-dialog]');
  await expect(researchDialog).toBeInViewport();
  await expect(researchDialog.getByRole('button', { name: 'Cerrar explicación' })).toBeFocused();
  await expect(researchDialog.locator('summary')).toHaveAttribute('tabindex', '-1');
  await expect(researchDialog.getByRole('heading')).toHaveText('¿Qué significa “péptido de investigación”?');
  await expect(researchDialog).toContainText('Algunas moléculas de nuestro catálogo continúan siendo estudiadas por la comunidad científica en etapas preclínicas o clínicas. Otras comparten ingredientes activos con medicamentos ya autorizados en determinadas presentaciones y jurisdicciones.');
  await expect(researchDialog).toContainText('La clasificación de investigación corresponde específicamente al material ofrecido por Mereon y no implica registro sanitario, equivalencia farmacéutica ni aprobación para una indicación terapéutica. Consulta la ficha técnica y la documentación de cada producto para conocer su condición particular.');
  await page.keyboard.press('Escape');
  await expect(researchDialog).not.toBeVisible();
  await expect(researchTrigger).toBeFocused();
  await expect(page.locator('.faq__items > details').last().locator('summary')).not.toHaveAttribute('tabindex');
  await researchTrigger.click();
  await researchDialog.getByRole('button', { name: 'Cerrar explicación' }).click();
  await expect(researchDialog).not.toBeVisible();
  await expect(researchTrigger).toBeFocused();
  await researchTrigger.click();
  await researchDialog.evaluate((dialog) => dialog.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(researchDialog).not.toBeVisible();
  await expect(researchTrigger).toBeFocused();
  await expect(page.locator('.faq__items > details').last().locator('summary')).toHaveText('¿Qué significa “péptido de investigación”?');
  await expect(page.locator('.coa-card-link[href]')).toHaveCount(12);
  await expect(page.locator('.coa-card-link--disabled')).toHaveCount(4);
  for (const link of await page.locator('.coa-card-link[href^="https://ascensionpeptides.com/"]').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', /^https:\/\/ascensionpeptides\.com\/wp-content\/uploads\/.*\.pdf$/);
  }
  const sermorelinCoa = page.locator('.product-card:has([data-detail="SERMORELIN-5"]) .coa-card-link');
  await expect(sermorelinCoa).toHaveAttribute('href', 'assets/documents/sermorelin-5-coa-2605280407.pdf');
  await expect(sermorelinCoa).toHaveAttribute('target', '_blank');
  await expect(page.locator('[data-add="SERMORELIN-5"]')).toBeDisabled();
  await expect(page.locator('.product-card:has([data-detail="SERMORELIN-5"]) .stock-label')).toHaveText('Agotado');
  await page.getByRole('button', { name: 'Mezclas' }).click();
  await expect(page.locator('.product-card')).toHaveCount(4);
  await expect(page.locator('[data-catalog-status]')).toContainText('4 de 16');
  await page.getByRole('button', { name: 'Compuestos' }).click();
  await expect(page.locator('.product-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Todos' }).click();
  await expect(page.locator('.product-card')).toHaveCount(16);

  const productImages = page.locator('.product-visual--photo img');
  await expect(productImages).toHaveCount(16);
  for (const image of await productImages.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty('complete', true);
    expect(await image.evaluate((node) => node.naturalWidth)).toBeGreaterThan(0);
  }
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
    cards: [...document.querySelectorAll('.product-card')].map((card) => card.scrollWidth - card.clientWidth)
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(Math.max(...overflow.cards)).toBeLessThanOrEqual(1);

  const detailsButton = page.locator('[data-detail="CJCIPA-5-5"]');
  await detailsButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-product-dialog]')).toBeInViewport();
  await expect(page.locator('[data-product-dialog] .mereon-verified-badge')).toHaveCount(1);
  await expect(page.locator('[data-product-dialog] .mereon-verified-note')).toContainText('Designación propia de Mereon');
  await expect(page.locator('[data-product-dialog] .mereon-verified-note')).toContainText('El estado del COA se muestra por separado');
  await expect(page.locator('[data-product-dialog] .coa-box')).toContainText('COA de referencia publicado por Ascension Peptides');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-product-dialog]')).not.toBeVisible();

  for (const product of catalogPayload.products) {
    await page.locator(`[data-detail="${product.code}"]`).click();
    const detail = page.locator('[data-product-dialog]');
    await expect(detail.locator('.product-detail__research-label')).toHaveText('Área de investigación');
    await expect(detail.locator('.product-detail__research-area')).toHaveText(product.researchArea);
    await expect(detail.locator('.product-detail__research-description')).toHaveText(product.researchDescription);
    await detail.locator('[data-detail-close]').click();
  }

  const cartButton = page.locator('[data-cart-open]');
  await cartButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-cart-dialog]')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-cart-dialog]')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('Sermorelin 5 mg is localized, priced at MXN 1,700, and visible but unavailable', async ({ page }) => {
  const externalMediaRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'protidehealth.com') externalMediaRequests.push(request.url());
  });
  await page.goto('/');
  const card = page.locator('.product-card').filter({ hasText: 'Sermorelin' });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('$1,700.00');
  await expect(card).toContainText('IVA incluido');
  await expect(card.locator('[data-add="SERMORELIN-5"]')).toBeDisabled();
  await expect(card.locator('[data-add="SERMORELIN-5"]')).toHaveText('Agotado');
  await expect(card.locator('img')).toHaveAttribute('src', 'assets/images/products/sermorelin-5.png');
  await expect(card.locator('.coa-card-link')).toHaveAttribute('href', 'assets/documents/sermorelin-5-coa-2605280407.pdf');

  await card.locator('[data-detail="SERMORELIN-5"]').click();
  const detail = page.locator('[data-product-dialog]');
  await expect(detail).toContainText('Protide Health');
  await expect(detail).toContainText('Exclusivamente para investigación; no para uso humano.');
  await expect(detail.locator('[data-add="SERMORELIN-5"]')).toBeDisabled();
  await expect(detail.locator('.coa-box a')).toHaveAttribute('href', 'assets/documents/sermorelin-5-coa-2605280407.pdf');
  expect(externalMediaRequests).toEqual([]);
});

test('every sellable catalog SKU shows the exact Mereon designation on card and detail', async ({ page }) => {
  await page.goto('/');
  for (const product of catalogFixture.products) {
    const sellable = isSellable(product);
    const card = page.locator(`.product-card:has([data-detail="${product.code}"])`);
    const cardBadge = card.locator('.mereon-verified-badge');
    await expect(cardBadge).toHaveCount(sellable ? 1 : 0);
    if (sellable) {
      await expect(cardBadge).toHaveText('Mereon Verified™');
      await expect(card.locator(`[data-add="${product.code}"]`)).toBeEnabled();
    } else {
      await expect(card.locator(`[data-add="${product.code}"]`)).toBeDisabled();
    }

    await card.locator(`[data-detail="${product.code}"]`).click();
    const detail = page.locator('[data-product-dialog]');
    const detailBadge = detail.locator('.mereon-verified-badge');
    await expect(detailBadge).toHaveCount(sellable ? 1 : 0);
    if (sellable) await expect(detailBadge).toHaveText('Mereon Verified™');
    await detail.locator('[data-detail-close]').click();
  }
});

test('official logo is accessible, proportional, and unclipped', async ({ page }) => {
  const errors = await trackRuntimeFailures(page);
  await page.goto('/');

  const homeLinks = page.getByRole('link', { name: 'Mereon, inicio', exact: true });
  await expect(homeLinks).toHaveCount(2);
  await expect(page.locator('.brand span, .brand small')).toHaveCount(0);

  const logos = page.locator('img[src="assets/mereon-logo.svg"]');
  await expect(logos).toHaveCount(2);
  for (const logo of await logos.all()) {
    await logo.scrollIntoViewIfNeeded();
    await expect(logo).toBeVisible();
    await expect(logo).toHaveJSProperty('complete', true);
    const geometry = await logo.evaluate((image) => {
      const imageRect = image.getBoundingClientRect();
      const linkRect = image.closest('a').getBoundingClientRect();
      return {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: imageRect.width,
        height: imageRect.height,
        clipped: imageRect.left < linkRect.left - 1 || imageRect.right > linkRect.right + 1 || imageRect.top < linkRect.top - 1 || imageRect.bottom > linkRect.bottom + 1
      };
    });
    expect(geometry.naturalWidth).toBe(268);
    expect(geometry.naturalHeight).toBe(91);
    expect(geometry.width / geometry.height).toBeCloseTo(268 / 91, 2);
    expect(geometry.width).toBeGreaterThanOrEqual(126);
    expect(geometry.clipped).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('reduced-motion preference disables smooth scrolling and transitions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'CSS behavior is viewport-independent.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(16);
  const motion = await page.evaluate(() => ({
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    transitionSeconds: parseFloat(getComputedStyle(document.querySelector('.product-card')).transitionDuration)
  }));
  expect(motion.scrollBehavior).toBe('auto');
  expect(motion.transitionSeconds).toBeLessThanOrEqual(0.001);
});

test('peptide-first CTA and responsive navigation work', async ({ page }, testInfo) => {
  const errors = await trackRuntimeFailures(page);
  await page.goto('/');
  await expect(page.locator('#hero-title')).toContainText('Tu salud merece prioridad.');
  await expect(page.locator('.hero__lead')).toContainText('péptidos de investigación');

  await page.locator('.hero__actions a[href="#catalogo"]').click();
  await expect(page).toHaveURL(/#catalogo$/);
  await expect(page.locator('#catalogo')).toBeInViewport();

  const navToggle = page.locator('.nav-toggle');
  if (testInfo.project.name === 'desktop') {
    await expect(navToggle).toBeHidden();
    await expect(page.locator('#primary-nav')).toBeVisible();
  } else {
    await expect(navToggle).toBeVisible();
    await expect(navToggle).toHaveAttribute('aria-expanded', 'false');
    await navToggle.click();
    await expect(navToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#primary-nav')).toBeVisible();
    await page.locator('#primary-nav a[href="#calidad"]').focus();
    await page.keyboard.press('Escape');
    await expect(navToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(navToggle).toBeFocused();
    await navToggle.click();
    await page.locator('#primary-nav a[href="#calidad"]').click();
    await expect(page).toHaveURL(/#calidad$/);
    await expect(navToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#calidad')).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test('cart add, quantity, totals, disabled payment, persistence, and removal work', async ({ page }) => {
  const errors = await trackRuntimeFailures(page);
  const outboundMutations = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      outboundMutations.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.goto('/');
  const t10Card = page.locator('.product-card:has([data-detail="T-10"])');
  await expect(t10Card.locator('.stock-label')).toHaveText('3 disponibles');
  await t10Card.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.locator('[data-cart-count]')).toHaveText('1');

  await page.locator('[data-cart-open]').click();
  const cart = page.locator('[data-cart-dialog]');
  await expect(cart).toBeVisible();
  await expect(cart).toBeInViewport();
  await expect(cart.locator('[data-subtotal]')).toContainText('1,550.00');
  await expect(cart.locator('[data-shipping]')).toContainText('250.00');
  await expect(cart.locator('[data-iva]')).toContainText('248.28');
  await expect(cart.locator('[data-total]')).toContainText('1,800.00');
  await expect(cart.getByText('De este total, IVA incluido (16%)')).toBeVisible();
  await expect(cart.getByText('IVA se muestra como dato informativo y no se suma nuevamente.')).toBeVisible();

  const payment = cart.locator('[data-payment-button]');
  await expect(payment).toBeEnabled();
  await expect(payment).toHaveText('Continuar con datos de envío');
  await expect(cart.locator('[data-payment-state]')).toHaveCount(0);
  await expect(cart.locator('.privacy-note')).toHaveCount(0);
  expect(outboundMutations).toEqual([]);

  await cart.getByRole('button', { name: 'Aumentar cantidad' }).click();
  await expect(page.locator('[data-cart-count]')).toHaveText('2');
  await expect(cart.locator('[data-subtotal]')).toContainText('3,100.00');
  await cart.locator('[data-cart-close]').first().click();
  await page.reload();
  await expect(page.locator('[data-cart-count]')).toHaveText('2');

  await page.locator('[data-cart-open]').click();
  await page.locator('[data-remove]').click();
  await expect(page.locator('[data-cart-count]')).toHaveText('0');
  await expect(page.locator('.empty-cart')).toContainText('Tu selección está vacía');
  await expect(payment).toBeDisabled();
  expect(errors).toEqual([]);
});

test('stock availability disables unordered products and clamps restored carts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Stock behavior is viewport-independent; cart layout is exercised in every project.');
  await page.addInitScript(() => localStorage.setItem('mereon-research-cart-v1', JSON.stringify([
    { code: 'T-10', quantity: 99 },
    { code: 'BPC-157-10', quantity: 4 },
    { code: 'TB500-5', quantity: 2 }
  ])));
  await page.goto('/');

  await expect(page.locator('.product-card:has([data-detail="TB500-5"]) .stock-label')).toHaveText('Agotado');
  await expect(page.locator('[data-add="TB500-5"]')).toBeDisabled();
  await expect(page.locator('.product-card:has([data-detail="BPC-157-10"]) .stock-label')).toHaveText('Última unidad');
  await expect(page.locator('[data-cart-count]')).toHaveText('4');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mereon-research-cart-v1')));
  expect(stored).toEqual([{ code: 'T-10', quantity: 3 }, { code: 'BPC-157-10', quantity: 1 }]);

  await page.locator('[data-cart-open]').click();
  const t10 = page.locator('.cart-item:has-text("T-10")');
  await expect(t10.getByRole('button', { name: 'Aumentar cantidad' })).toBeDisabled();
  await expect(t10).toContainText('Máximo disponible: 3');
});

test('checkout validates Mexico delivery data and sends no client prices before Stripe redirect', async ({ page }) => {
  let checkoutPayload;
  await page.route('https://api.mereonhealth.com/v1/checkout', async (route) => {
    checkoutPayload = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_live_safe_test' }) });
  });
  await page.route('https://checkout.stripe.com/**', (route) => route.abort());
  await page.goto('/');
  await page.locator('[data-add="T-10"]').click();
  await page.locator('[data-cart-open]').click();
  await page.locator('[data-payment-button]').click();
  const form = page.locator('[data-checkout-form]');
  await expect(form).toBeVisible();
  const termsLink = form.getByRole('link', { name: 'Términos y condiciones' });
  const privacyLink = form.getByRole('link', { name: 'Aviso de privacidad' });
  await expect(termsLink).toHaveAttribute('href', 'terminos/');
  await expect(privacyLink).toHaveAttribute('href', 'privacidad/');
  await termsLink.focus();
  await expect(termsLink).toBeFocused();
  await termsLink.evaluate((link) => link.addEventListener('click', (event) => event.preventDefault(), { once: true }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await expect(form.locator('[name="ruoAccepted"]')).not.toBeChecked();
  await form.locator('[data-checkout-submit]').click();
  await expect(form.locator('[name="fullName"]')).toBeFocused();
  await form.locator('[name="fullName"]').fill('Cliente Interno');
  await form.locator('[name="email"]').fill('partnerships@mereonhealth.com');
  await form.locator('[name="phone"]').fill('123');
  await form.locator('[name="address1"]').fill('Av. Reforma 100');
  await form.locator('[name="colonia"]').fill('Centro');
  await form.locator('[name="municipality"]').fill('Cuauhtémoc');
  await form.locator('[name="city"]').fill('Ciudad de México');
  await form.locator('[name="state"]').selectOption('CMX');
  await form.locator('[name="postalCode"]').fill('06000');
  await form.locator('[name="ruoAccepted"]').check();
  await form.locator('[data-checkout-submit]').click();
  await expect(form.locator('[name="phone"]')).toBeFocused();
  await form.locator('[name="phone"]').fill('55 1234 5678');
  const stripeRequest = page.waitForRequest('https://checkout.stripe.com/c/pay/cs_live_safe_test');
  await Promise.all([page.waitForRequest('https://api.mereonhealth.com/v1/checkout'), form.locator('[data-checkout-submit]').click()]);
  expect((await stripeRequest).url()).toBe('https://checkout.stripe.com/c/pay/cs_live_safe_test');
  expect(checkoutPayload.currency).toBe('mxn');
  expect(checkoutPayload.shippingId).toBe('standard');
  expect(checkoutPayload.lines).toEqual([{ code: 'T-10', quantity: 1 }]);
  expect(checkoutPayload.customer.country).toBe('MX');
  expect(checkoutPayload.ruoAccepted).toBe(true);
  expect(JSON.stringify(checkoutPayload)).not.toMatch(/unitAmount|unitPrice|subtotal|shippingAmount|total|iva|tax/i);
});

test('legal routes and storefront footer are responsive, accessible, and error free', async ({ page }) => {
  for (const route of ['terminos', 'privacidad']) {
    const errors = await trackRuntimeFailures(page);
    await page.goto(`/${route}/`);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Volver a la tienda' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mereon, inicio', exact: true })).toHaveCount(2);
    await page.getByRole('link', { name: 'Volver a la tienda' }).focus();
    await expect(page.getByRole('link', { name: 'Volver a la tienda' })).toBeFocused();
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      article: document.querySelector('.legal-document').scrollWidth - document.querySelector('.legal-document').clientWidth
    }));
    expect(Math.max(...Object.values(overflow))).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  }

  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'Términos y condiciones' })).toHaveAttribute('href', 'terminos/');
  await expect(footer.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', 'privacidad/');
});

test('success and cancellation pages trust only API-verified state', async ({ page }, testInfo) => {
  const token = 'a'.repeat(64);
  const origin = new URL(String(testInfo.project.use.baseURL)).origin;
  const cors = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'Content-Type' };
  await page.route('https://api.mereonhealth.com/v1/orders/status', (route) => route.fulfill(route.request().method() === 'OPTIONS'
    ? { status: 204, headers: cors }
    : { status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ orderNumber: 'MEREON-20260803-ABC123', status: 'paid', lines: [{ name: 'Tirzepatida (T-10)', presentation: '10 mg', quantity: 1, lineTotal: 155000 }], subtotal: 155000, shipping: { label: 'Estándar', amount: 25000 }, total: 180000, includedIva: 24828 }) }));
  await page.goto(`/checkout-success.html#token=${token}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pago confirmado');
  await expect(page.locator('[data-order-summary]')).toContainText('$1,800.00');
  await expect(page.locator('body')).not.toContainText('Av. Reforma');
  await page.route('https://api.mereonhealth.com/v1/orders/cancel', (route) => route.fulfill(route.request().method() === 'OPTIONS' ? { status: 204, headers: cors } : { status: 200, contentType: 'application/json', headers: cors, body: '{"cancelled":true}' }));
  await page.goto(`/checkout-cancel.html#token=${token}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pago cancelado');
  await expect(page.locator('[data-state-message]')).toContainText('No se realizó ningún cargo');
});

test('COA-pending sellable product keeps the COA state separate from its Mereon designation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Single behavior check is sufficient; responsive layout is covered separately.');
  await page.goto('/');
  const firstCard = page.locator('.product-card').first();
  await expect(firstCard).toContainText('COA de referencia pendiente de revisión por Mereon');
  await expect(firstCard.locator('.mereon-verified-badge')).toHaveText('Mereon Verified™');
  await expect(firstCard.locator('a[href$=".pdf"]')).toHaveCount(0);
  await firstCard.locator('[data-detail]').click();
  const detail = page.locator('[data-product-dialog]');
  await expect(detail).toBeInViewport();
  await expect(detail).toContainText('COA de referencia pendiente de revisión por Mereon');
  await expect(detail.locator('.mereon-verified-badge')).toHaveText('Mereon Verified™');
  await expect(detail.locator('.mereon-verified-note')).toHaveCount(1);
  await expect(detail.getByRole('link', { name: /Ver COA/ })).toHaveCount(0);
  await expect(detail.locator('[aria-disabled="true"]')).toHaveText('Ver COA no disponible');
  await expect(detail).not.toContainText('null');
});
