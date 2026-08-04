import {
  SHIPPING_OPTIONS,
  calculateCheckoutTotals,
  formatMxn,
  normalizeCart,
  updateQuantity
} from './pricing.js';
import { paymentAdapter } from './payment-adapter.js';
const CART_KEY = 'mereon-research-cart-v1';
const MEREON_DESIGNATION = 'Mereon Verified™';
const BLEND_CODES = new Set(['CJCIPA-5-5', 'GLOW-70', 'KLOW-80', 'WOLVERINE-10-10']);
const TONES = [
  ['#5d9784', '#d6f5e8'], ['#8e745d', '#f0ddcb'], ['#546f81', '#d9e9f1'],
  ['#6c7f62', '#e4efd5'], ['#8e6677', '#f1dbe3'], ['#577d78', '#d8efea']
];

const grid = document.querySelector('[data-product-grid]');
const catalogStatus = document.querySelector('[data-catalog-status]');
const productDialog = document.querySelector('[data-product-dialog]');
const productDetail = document.querySelector('[data-product-detail]');
const researchDialog = document.querySelector('[data-research-dialog]');
const researchTrigger = document.querySelector('[data-research-open]');
const researchFaq = document.querySelector('[data-research-faq]');
const researchFaqHome = researchFaq.parentElement;
const researchDialogContent = document.querySelector('[data-research-dialog-content]');
const cartDialog = document.querySelector('[data-cart-dialog]');
const cartItems = document.querySelector('[data-cart-items]');
const cartCount = document.querySelector('[data-cart-count]');
const cartTrigger = document.querySelector('[data-cart-open]');
const paymentButton = document.querySelector('[data-payment-button]');
const checkoutAvailability = document.querySelector('[data-checkout-availability]');
const checkoutDialog = document.querySelector('[data-checkout-dialog]');
const checkoutForm = document.querySelector('[data-checkout-form]');
const checkoutError = document.querySelector('[data-checkout-error]');
const checkoutSubmit = document.querySelector('[data-checkout-submit]');
const toast = document.querySelector('[data-toast]');
const navToggle = document.querySelector('.nav-toggle');
const primaryNav = document.querySelector('#primary-nav');

function closeNavigation({ restoreFocus = false } = {}) {
  if (!navToggle || !primaryNav) return;
  const wasOpen = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Abrir navegación');
  primaryNav.classList.remove('is-open');
  if (restoreFocus && wasOpen) navToggle.focus();
}

if (navToggle && primaryNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Abrir navegación' : 'Cerrar navegación');
    primaryNav.classList.toggle('is-open', !isOpen);
  });
  primaryNav.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;

    const destination = link.hash ? document.getElementById(link.hash.slice(1)) : null;
    closeNavigation();
    if (destination) {
      if (!destination.hasAttribute('tabindex')) destination.tabIndex = -1;
      window.requestAnimationFrame(() => destination.focus({ preventScroll: true }));
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNavigation({ restoreFocus: true });
  });
}

let catalog = [];
let productByCode = new Map();
let cart = [];
let shippingId = 'standard';
let activeFilter = 'all';
let inventoryVerified = false;
let checkoutBusy = false;
let toastTimer;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function isPurchasable(product) {
  return product.purchaseEnabled === true && Number(product.stockQuantity) > 0;
}

function stockByCode() {
  return new Map(catalog.map((product) => [product.code, isPurchasable(product) ? product.stockQuantity : 0]));
}

function stockLabel(product) {
  if (product.stockQuantity < 1) return 'Agotado';
  if (product.stockQuantity === 1) return 'Última unidad';
  return `${product.stockQuantity} disponibles`;
}

function statusLabel(product) {
  if (product.status === 'evaluation') return 'En evaluación';
  if (product.status === 'coa_pending') return 'COA de referencia pendiente';
  return 'COA de referencia revisado';
}

function visualMarkup(product, index) {
  const [tone, light] = TONES[index % TONES.length];
  const shortName = product.name.replace(' blend', '').slice(0, 18);
  if (product.image?.assetPath) {
    return `<figure class="product-visual product-visual--photo" data-index="${String(index + 1).padStart(2, '0')}" style="--tone:${tone};--tone-light:${light}">
      <img src="${escapeHtml(product.image.assetPath)}" alt="${escapeHtml(product.image.alt)}" loading="lazy" width="800" height="533">
      <figcaption>Fotografía de referencia de la fuente · presentación indicada en ficha</figcaption>
    </figure>`;
  }
  return `<div class="product-visual" data-index="${String(index + 1).padStart(2, '0')}" style="--tone:${tone};--tone-light:${light}">
    <div class="product-vial" aria-hidden="true"><span class="product-vial__label"><b>MEREON</b><span>${escapeHtml(shortName)}</span></span></div>
  </div>`;
}

function renderCatalog() {
  const products = catalog.filter((product) => activeFilter === 'all'
    || (activeFilter === 'blend' ? BLEND_CODES.has(product.code) : !BLEND_CODES.has(product.code)));
  grid.innerHTML = products.map((product) => {
    const index = catalog.findIndex((item) => item.code === product.code);
    const purchasable = isPurchasable(product);
    const price = product.status === 'evaluation' ? 'Precio por confirmar' : formatMxn(product.basePriceCentavos);
    const coaAction = product.coa?.url
      ? `<a class="coa-card-link" href="${escapeHtml(product.coa.url)}" target="_blank" rel="noopener noreferrer" aria-label="Ver COA de referencia de ${escapeHtml(product.name)} en sitio externo">Ver COA <span aria-hidden="true">↗</span></a>`
      : `<span class="coa-card-link coa-card-link--disabled" aria-disabled="true">${escapeHtml(product.coa?.label || 'COA no publicado por la fuente')}</span>`;
    const verificationBadge = purchasable
      ? `<span class="mereon-verified-badge" aria-label="Designación propia de Mereon"><span aria-hidden="true"></span><strong>${MEREON_DESIGNATION}</strong></span>`
      : '';
    return `<article class="product-card" data-kind="${BLEND_CODES.has(product.code) ? 'blend' : 'single'}">
      ${visualMarkup(product, index)}
      <div class="product-card__body">
        <div class="product-card__meta"><span>${BLEND_CODES.has(product.code) ? 'Mezcla de referencia' : 'Compuesto de referencia'}</span><span>${escapeHtml(product.code)}</span></div>
        ${verificationBadge}
        <h3>${escapeHtml(product.name)}</h3>
        <p class="product-card__presentation">${escapeHtml(product.presentation)}</p>
        <p class="product-card__research"><span>Área de investigación</span><strong class="product-card__research-area">${escapeHtml(product.researchArea)}</strong></p>
        <p class="supplier-line"><span>${escapeHtml(product.brandSupplier.role)}</span><strong>${escapeHtml(product.brandSupplier.brand)}</strong></p>
        <span class="status-badge ${product.status === 'available' ? '' : 'status-badge--pending'}">${statusLabel(product)}</span>
        <span class="stock-label ${product.stockQuantity < 1 ? 'stock-label--out' : 'stock-label--low'}">${stockLabel(product)}</span>
        <div class="product-price"><strong>${price}</strong><small>IVA incluido · envío al pagar</small></div>
        <div class="product-actions">
          <button class="button button--primary" type="button" data-add="${escapeHtml(product.code)}" ${purchasable ? '' : 'disabled'}>${purchasable ? 'Agregar' : 'Agotado'}</button>
          <button class="details-button" type="button" data-detail="${escapeHtml(product.code)}" aria-label="Ver detalle de ${escapeHtml(product.name)}">↗</button>
        </div>
        ${coaAction}
      </div>
    </article>`;
  }).join('');
  catalogStatus.textContent = `${products.length} de ${catalog.length} referencias`;
}

function readStoredCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}

function persistCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    showToast('No fue posible guardar el carrito en este navegador.');
  }
}

function cartLines() {
  return cart.map((line) => {
    const product = productByCode.get(line.code);
    return product && isPurchasable(product)
      ? { product, quantity: line.quantity, unitPriceCentavos: product.basePriceCentavos }
      : null;
  }).filter(Boolean);
}

function renderShipping() {
  document.querySelector('[data-shipping-options]').innerHTML = SHIPPING_OPTIONS.map((option) => `
    <label class="shipping-option">
      <input type="radio" name="shipping" value="${option.id}" ${option.id === shippingId ? 'checked' : ''}>
      <span>${option.label}</span><strong>${formatMxn(option.priceCentavos)}</strong>
    </label>`).join('');
}

function renderCart() {
  const lines = cartLines();
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  cartCount.textContent = String(totalQuantity);
  cartTrigger.setAttribute('aria-label', `Abrir carrito, ${totalQuantity} ${totalQuantity === 1 ? 'artículo' : 'artículos'}`);
  cartItems.innerHTML = lines.length ? lines.map(({ product, quantity }) => `
    <article class="cart-item">
      <div class="cart-item__swatch" aria-hidden="true">${escapeHtml(product.name.slice(0, 5).toUpperCase())}</div>
      <div><h4>${escapeHtml(product.name)}</h4><p>${escapeHtml(product.presentation)}</p>
        <div class="cart-item__controls" aria-label="Cantidad de ${escapeHtml(product.name)}">
          <button type="button" data-quantity="${escapeHtml(product.code)}" data-value="${quantity - 1}" aria-label="Reducir cantidad">−</button>
          <span aria-live="polite">${quantity}</span>
          <button type="button" data-quantity="${escapeHtml(product.code)}" data-value="${quantity + 1}" aria-label="Aumentar cantidad" ${quantity >= product.stockQuantity ? 'disabled' : ''}>+</button>
          <button type="button" data-remove="${escapeHtml(product.code)}">Quitar</button>
        </div>
        <p class="cart-item__stock">Máximo disponible: ${product.stockQuantity}</p>
      </div>
      <strong>${formatMxn(product.basePriceCentavos * quantity)}</strong>
    </article>`).join('') : '<div class="empty-cart"><p>Tu selección está vacía.</p><button class="button" type="button" data-cart-close>Explorar catálogo</button></div>';

  const shipping = lines.length
    ? SHIPPING_OPTIONS.find((option) => option.id === shippingId)?.priceCentavos ?? SHIPPING_OPTIONS[0].priceCentavos
    : 0;
  const totals = calculateCheckoutTotals(lines, shipping);
  document.querySelector('[data-subtotal]').textContent = formatMxn(totals.productSubtotalCentavos);
  document.querySelector('[data-shipping]').textContent = formatMxn(totals.shippingCentavos);
  document.querySelector('[data-iva]').textContent = formatMxn(totals.ivaCentavos);
  document.querySelector('[data-total]').textContent = formatMxn(totals.finalTotalCentavos);
  document.querySelectorAll('input[name="shipping"]').forEach((input) => { input.disabled = !lines.length; });
  paymentButton.disabled = !lines.length || !inventoryVerified || checkoutBusy;
  paymentButton.textContent = inventoryVerified ? 'Continuar con datos de envío' : 'Pago temporalmente no disponible';
  checkoutAvailability.textContent = inventoryVerified
    ? 'Existencias verificadas. El cobro será exactamente subtotal más envío.'
    : 'No pudimos verificar existencias en tiempo real. La compra permanece desactivada.';
}

function changeQuantity(code, quantity) {
  cart = updateQuantity(cart, code, quantity, stockByCode());
  persistCart();
  renderCart();
}

function addToCart(code) {
  const product = productByCode.get(code);
  if (!product || !isPurchasable(product)) return;
  const existing = cart.find((line) => line.code === code);
  if ((existing?.quantity || 0) >= product.stockQuantity) {
    showToast(`Ya seleccionaste el máximo disponible de ${product.name}.`);
    return;
  }
  changeQuantity(code, (existing?.quantity || 0) + 1);
  showToast(`${product.name} se agregó a tu selección.`);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function renderDetail(product) {
  const index = catalog.findIndex((item) => item.code === product.code);
  const coa = product.coa;
  const verificationMarkup = isPurchasable(product)
    ? `<div class="mereon-verified-note">
        <span class="mereon-verified-badge" aria-label="Designación propia de Mereon"><span aria-hidden="true"></span><strong>${MEREON_DESIGNATION}</strong></span>
        <p>Designación propia de Mereon para este producto disponible. El estado del COA se muestra por separado.</p>
      </div>`
    : '';
  const coaMarkup = coa?.url ? `<div class="coa-box">
      <h3>${escapeHtml(coa.label)}</h3>
      <dl class="coa-meta"><dt>Lote de la fuente</dt><dd>${escapeHtml(coa.lot)}</dd><dt>Laboratorio publicado</dt><dd>${escapeHtml(coa.lab)}</dd><dt>Métodos publicados</dt><dd>${escapeHtml(coa.methods.join(' · '))}</dd></dl>
      <a href="${escapeHtml(coa.url)}" target="_blank" rel="noopener noreferrer">Ver COA en sitio externo <span aria-hidden="true">↗</span></a>
      <p class="external-note">Documento público de referencia del catálogo fuente. No corresponde todavía a un lote Mereon y no implica afiliación, autorización o reventa oficial.</p>
    </div>` : `<div class="coa-box"><h3>COA pendiente</h3><p>${escapeHtml(coa?.label || 'COA no publicado por la fuente.')}</p><span class="button" aria-disabled="true">Ver COA no disponible</span></div>`;
  productDetail.innerHTML = `<div class="product-detail__layout">
    <div class="product-detail__visual">${visualMarkup(product, index)}</div>
    <div class="product-detail__copy">
      <button class="icon-button" type="button" data-detail-close aria-label="Cerrar detalle" style="float:right">×</button>
      <p class="eyebrow">${escapeHtml(product.code)}</p><h2 id="detail-title">${escapeHtml(product.name)}</h2>
      <p class="product-detail__presentation">${escapeHtml(product.presentation)}</p>
      ${verificationMarkup}
      <dl class="supplier-detail"><dt>${escapeHtml(product.brandSupplier.role)}</dt><dd>${escapeHtml(product.brandSupplier.brand)}</dd><dt>Ficha pública de la fuente</dt><dd><a href="${escapeHtml(product.source.productUrl)}" target="_blank" rel="noopener noreferrer">Ver producto en Ascension Peptides <span aria-hidden="true">↗</span></a></dd><dt>Plataforma comercial</dt><dd>Mereon Health</dd></dl>
      <section class="product-detail__research" aria-labelledby="detail-research-label">
        <p class="product-detail__research-label" id="detail-research-label">Área de investigación</p>
        <h3 class="product-detail__research-area">${escapeHtml(product.researchArea)}</h3>
        <p class="product-detail__research-description">${escapeHtml(product.researchDescription)}</p>
      </section>
      ${coaMarkup}
      <p class="stock-label ${product.stockQuantity < 1 ? 'stock-label--out' : 'stock-label--low'}">${stockLabel(product)}</p>
      <div class="product-detail__actions"><button class="button button--primary" type="button" data-add="${escapeHtml(product.code)}" ${isPurchasable(product) ? '' : 'disabled'}>${isPurchasable(product) ? `Agregar · ${formatMxn(product.basePriceCentavos)}` : 'Agotado'}</button></div>
    </div>
  </div>`;
  productDialog.showModal();
}

function closeOnBackdrop(dialog, event) {
  if (event.target === dialog) dialog.close();
}

grid.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add]');
  const detail = event.target.closest('[data-detail]');
  if (add) addToCart(add.dataset.add);
  if (detail) renderDetail(productByCode.get(detail.dataset.detail));
});

productDetail.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add]');
  if (event.target.closest('[data-detail-close]')) productDialog.close();
  if (add) addToCart(add.dataset.add);
});
productDialog.addEventListener('click', (event) => closeOnBackdrop(productDialog, event));
researchDialog.addEventListener('click', (event) => closeOnBackdrop(researchDialog, event));
cartDialog.addEventListener('click', (event) => closeOnBackdrop(cartDialog, event));

researchTrigger.addEventListener('click', () => {
  researchFaq.open = true;
  researchFaq.querySelector('summary')?.setAttribute('tabindex', '-1');
  researchDialogContent.append(researchFaq);
  researchDialog.showModal();
});
researchDialog.querySelector('[data-research-close]').addEventListener('click', () => researchDialog.close());
researchDialog.addEventListener('close', () => {
  researchFaq.querySelector('summary')?.removeAttribute('tabindex');
  researchFaq.open = false;
  researchFaqHome.append(researchFaq);
});
researchDialog.addEventListener('close', () => researchTrigger.focus());

cartTrigger.addEventListener('click', () => {
  cartDialog.showModal();
});
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-cart-close]')) cartDialog.close();
});
cartItems.addEventListener('click', (event) => {
  const quantity = event.target.closest('[data-quantity]');
  const remove = event.target.closest('[data-remove]');
  if (quantity) changeQuantity(quantity.dataset.quantity, Number(quantity.dataset.value));
  if (remove) changeQuantity(remove.dataset.remove, 0);
});
document.querySelector('[data-shipping-options]').addEventListener('change', (event) => {
  if (event.target.matches('input[name="shipping"]')) {
    shippingId = event.target.value;
    renderCart();
  }
});

paymentButton.addEventListener('click', () => {
  if (paymentButton.disabled) return;
  checkoutError.hidden = true;
  cartDialog.close();
  checkoutDialog.showModal();
  checkoutForm.elements.fullName.focus();
});
document.querySelector('[data-checkout-close]').addEventListener('click', () => checkoutDialog.close());
checkoutDialog.addEventListener('click', (event) => { if (event.target === checkoutDialog && !checkoutBusy) checkoutDialog.close(); });
checkoutForm.elements.phone.addEventListener('input', () => checkoutForm.elements.phone.setCustomValidity(''));

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  checkoutError.hidden = true;
  if (!checkoutForm.reportValidity()) return;
  const form = new FormData(checkoutForm);
  const phoneDigits = String(form.get('phone') || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (!/^(52)?\d{10}$/.test(phoneDigits)) {
    checkoutForm.elements.phone.setCustomValidity('Ingresa un teléfono mexicano de 10 dígitos.');
    checkoutForm.elements.phone.reportValidity();
    return;
  }
  checkoutBusy = true;
  checkoutSubmit.disabled = true;
  checkoutSubmit.textContent = 'Creando sesión segura…';
  renderCart();
  const result = await paymentAdapter.createOrder({
    currency: 'mxn', shippingId,
    lines: cart.map(({ code, quantity }) => ({ code, quantity })),
    customer: {
      fullName: form.get('fullName'), email: form.get('email'), phone: form.get('phone'),
      address1: form.get('address1'), interior: form.get('interior'), colonia: form.get('colonia'),
      municipality: form.get('municipality'), city: form.get('city'), state: form.get('state'),
      postalCode: form.get('postalCode'), country: 'MX', notes: form.get('notes')
    },
    ruoAccepted: form.get('ruoAccepted') === 'on'
  });
  if (result.ok) {
    window.location.assign(result.checkoutUrl);
    return;
  }
  checkoutBusy = false;
  checkoutSubmit.disabled = false;
  checkoutSubmit.textContent = 'Continuar a Stripe · pago seguro';
  checkoutError.textContent = result.code === 'OUT_OF_STOCK'
    ? 'Las existencias cambiaron. Actualiza tu carrito e inténtalo de nuevo.'
    : 'No pudimos iniciar el pago. No se realizó ningún cargo. Inténtalo de nuevo.';
  checkoutError.hidden = false;
  renderCart();
});

async function syncInventory() {
  const result = await paymentAdapter.getAvailability();
  if (!result.ok) { inventoryVerified = false; renderCart(); return; }
  const live = new Map(result.products.map((item) => [item.code, item]));
  const purchasable = catalog.filter((product) => product.stockQuantity > 0);
  const matches = purchasable.every((product) => {
    const current = live.get(product.code);
    return current && Number.isInteger(current.available) && current.available >= 0 && current.unitAmount === product.basePriceCentavos;
  });
  if (!matches) { inventoryVerified = false; renderCart(); return; }
  catalog = catalog.map((product) => {
    const current = live.get(product.code);
    return current ? { ...product, stockQuantity: current.available } : product;
  });
  productByCode = new Map(catalog.map((product) => [product.code, product]));
  inventoryVerified = true;
  cart = normalizeCart(cart, stockByCode());
  persistCart();
  renderCatalog();
  renderCart();
}
document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle('is-active', active);
      candidate.setAttribute('aria-pressed', String(active));
    });
    renderCatalog();
  });
});

window.addEventListener('storage', (event) => {
  if (event.key !== CART_KEY) return;
  let candidate;
  try {
    candidate = JSON.parse(event.newValue || '[]');
  } catch {
    candidate = [];
  }
  cart = normalizeCart(candidate, stockByCode());
  if (JSON.stringify(cart) !== JSON.stringify(candidate)) persistCart();
  renderCart();
});

document.querySelector('[data-year]').textContent = String(new Date().getFullYear());
renderShipping();

try {
  const response = await fetch('./data/catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.products) || payload.products.length !== 14) throw new Error('Catálogo incompleto');
  catalog = payload.products;
  productByCode = new Map(catalog.map((product) => [product.code, product]));
  cart = normalizeCart(readStoredCart(), stockByCode());
  persistCart();
  renderCatalog();
  renderCart();
  await syncInventory();
} catch (error) {
  console.error('Catalog initialization failed:', error);
  catalogStatus.textContent = 'Catálogo temporalmente no disponible';
  grid.innerHTML = '<p class="error-panel">No pudimos validar el catálogo. Por seguridad, precios y compra permanecen desactivados.</p>';
  renderCart();
}
