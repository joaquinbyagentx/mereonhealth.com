import { test, expect } from '@playwright/test';

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
  await expect(page.locator('.product-card')).toHaveCount(12);
  await expect(page.locator('.product-card .mereon-verified-badge')).toHaveCount(10);
  await expect(page.locator('[data-catalog-status]')).toContainText('12 de 12');
  const researchTrigger = page.getByRole('button', { name: '¿Qué significa?' });
  await expect(researchTrigger).toBeVisible();
  await researchTrigger.click();
  const researchDialog = page.locator('[data-research-dialog]');
  await expect(researchDialog).toBeInViewport();
  await expect(researchDialog.getByRole('button', { name: 'Cerrar explicación' })).toBeFocused();
  await expect(researchDialog.getByRole('heading')).toHaveText('¿Qué significa “péptido de investigación”?');
  await expect(researchDialog).toContainText('Algunas moléculas de nuestro catálogo continúan siendo estudiadas por la comunidad científica en etapas preclínicas o clínicas. Otras comparten ingredientes activos con medicamentos ya autorizados en determinadas presentaciones y jurisdicciones.');
  await expect(researchDialog).toContainText('La clasificación de investigación corresponde específicamente al material ofrecido por Mereon y no implica registro sanitario, equivalencia farmacéutica ni aprobación para una indicación terapéutica. Consulta la ficha técnica y la documentación de cada producto para conocer su condición particular.');
  await page.keyboard.press('Escape');
  await expect(researchDialog).not.toBeVisible();
  await expect(researchTrigger).toBeFocused();
  await researchTrigger.click();
  await researchDialog.getByRole('button', { name: 'Cerrar explicación' }).click();
  await expect(researchDialog).not.toBeVisible();
  await expect(researchTrigger).toBeFocused();
  await researchTrigger.click();
  await researchDialog.evaluate((dialog) => dialog.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(researchDialog).not.toBeVisible();
  await expect(researchTrigger).toBeFocused();
  await expect(page.locator('.coa-card-link[href]')).toHaveCount(10);
  await expect(page.locator('.coa-card-link--disabled')).toHaveCount(2);
  for (const link of await page.locator('.coa-card-link[href]').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', /^https:\/\/ascensionpeptides\.com\/wp-content\/uploads\/.*\.pdf$/);
  }
  await page.getByRole('button', { name: 'Mezclas' }).click();
  await expect(page.locator('.product-card')).toHaveCount(4);
  await expect(page.locator('[data-catalog-status]')).toContainText('4 de 12');
  await page.getByRole('button', { name: 'Compuestos' }).click();
  await expect(page.locator('.product-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Todos' }).click();
  await expect(page.locator('.product-card')).toHaveCount(12);

  const productImages = page.locator('.product-visual--photo img');
  await expect(productImages).toHaveCount(12);
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

  const detailsButton = page.locator('[data-detail="TB500-5"]');
  await detailsButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-product-dialog]')).toBeInViewport();
  await expect(page.locator('[data-product-dialog] .mereon-verified-badge')).toHaveCount(1);
  await expect(page.locator('[data-product-dialog] .mereon-verified-note')).toContainText('origen estadounidense');
  await expect(page.locator('[data-product-dialog] .mereon-verified-note')).toContainText('pruebas independientes');
  await expect(page.locator('[data-product-dialog] .mereon-verified-note')).toContainText('Estado documental del lote');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-product-dialog]')).not.toBeVisible();

  const cartButton = page.locator('[data-cart-open]');
  await cartButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-cart-dialog]')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-cart-dialog]')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('reduced-motion preference disables smooth scrolling and transitions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'CSS behavior is viewport-independent.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(12);
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
  const firstCard = page.locator('.product-card').first();
  await firstCard.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.locator('[data-cart-count]')).toHaveText('1');

  await page.locator('[data-cart-open]').click();
  const cart = page.locator('[data-cart-dialog]');
  await expect(cart).toBeVisible();
  await expect(cart).toBeInViewport();
  await expect(cart.locator('[data-subtotal]')).toContainText('1,350.00');
  await expect(cart.locator('[data-shipping]')).toContainText('250.00');
  await expect(cart.locator('[data-iva]')).toContainText('220.69');
  await expect(cart.locator('[data-total]')).toContainText('1,600.00');

  const payment = cart.locator('[data-payment-button]');
  await expect(payment).toBeDisabled();
  await expect(payment).toHaveText('Pago no disponible');
  await expect(cart.locator('[data-payment-state]')).toHaveCount(0);
  await expect(cart.locator('.privacy-note')).toHaveCount(0);
  expect(outboundMutations).toEqual([]);

  await cart.getByRole('button', { name: 'Aumentar cantidad' }).click();
  await expect(page.locator('[data-cart-count]')).toHaveText('2');
  await expect(cart.locator('[data-subtotal]')).toContainText('2,700.00');
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

test('COA-pending product disables external navigation and remains transparent', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Single behavior check is sufficient; responsive layout is covered separately.');
  await page.goto('/');
  const firstCard = page.locator('.product-card').first();
  await expect(firstCard).toContainText('COA pendiente de publicación por Ascension Peptides');
  await expect(firstCard.locator('.mereon-verified-badge')).toHaveCount(0);
  await expect(firstCard.locator('a[href$=".pdf"]')).toHaveCount(0);
  await firstCard.locator('[data-detail]').click();
  const detail = page.locator('[data-product-dialog]');
  await expect(detail).toBeInViewport();
  await expect(detail).toContainText('COA pendiente de publicación por Ascension Peptides');
  await expect(detail).not.toContainText('Mereon Verified');
  await expect(detail.locator('.mereon-verified-badge')).toHaveCount(0);
  await expect(detail.locator('.mereon-verified-note')).toHaveCount(0);
  await expect(detail.getByRole('link', { name: /Ver COA/ })).toHaveCount(0);
  await expect(detail.locator('[aria-disabled="true"]')).toHaveText('Ver COA no disponible');
  await expect(detail).not.toContainText('null');
});
