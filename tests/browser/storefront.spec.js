import { test, expect } from '@playwright/test';

async function trackRuntimeFailures(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === 'http://127.0.0.1:8000' && response.status() >= 400) {
      errors.push(`response ${response.status()}: ${url.pathname}`);
    }
  });
  return errors;
}

test('responsive catalog has no runtime errors or horizontal overflow', async ({ page }) => {
  const errors = await trackRuntimeFailures(page);
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(12);
  await expect(page.locator('[data-catalog-status]')).toContainText('12 de 12');
  await expect(page.locator('.coa-card-link[href]')).toHaveCount(12);
  for (const link of await page.locator('.coa-card-link[href]').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', /^https:\/\/protidehealth\.com\/certificates\//);
  }
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);

  const detailsButton = page.locator('[data-detail]').first();
  await detailsButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-product-dialog]')).toBeInViewport();
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

test('cart add, quantity, totals, legal gate, persistence, and removal work', async ({ page }) => {
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
  await expect(cart.locator('[data-subtotal]')).toContainText('1,740.00');
  await expect(cart.locator('[data-shipping]')).toContainText('250.00');
  await expect(cart.locator('[data-iva]')).toContainText('274.48');
  await expect(cart.locator('[data-total]')).toContainText('1,990.00');

  const payment = cart.locator('[data-payment-button]');
  await expect(payment).toBeDisabled();
  await cart.locator('[data-legal-accept]').check();
  await expect(payment).toBeEnabled();
  await payment.click();
  await expect(cart.locator('[data-payment-state]')).toHaveText('Pedido no enviado. Pago seguro próximamente.');
  await expect(cart.locator('.privacy-note')).toContainText('no se guardan ni se transmiten');
  expect(outboundMutations).toEqual([]);

  await cart.getByRole('button', { name: 'Aumentar cantidad' }).click();
  await expect(page.locator('[data-cart-count]')).toHaveText('2');
  await expect(cart.locator('[data-subtotal]')).toContainText('3,480.00');
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
  await page.route('**/data/catalog.json', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.products[0].status = 'coa_pending';
    payload.products[0].coa = null;
    await route.fulfill({ response, json: payload });
  });
  await page.goto('/');
  const firstCard = page.locator('.product-card').first();
  await expect(firstCard).toContainText('COA pendiente de asignación/publicación para este lote');
  await expect(firstCard.locator('a[href*="/certificates/"]')).toHaveCount(0);
  await firstCard.locator('[data-detail]').click();
  await expect(page.locator('[data-product-dialog]')).toBeInViewport();
  await expect(page.locator('[data-product-dialog]')).toContainText('COA pendiente de asignación/publicación para este lote');
  await expect(page.locator('[data-product-dialog] a[href*="/certificates/"]')).toHaveCount(0);
});
