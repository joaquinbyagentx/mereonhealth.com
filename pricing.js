export const CHECKOUT_CONFIG = Object.freeze({
  ivaBasisPoints: 1600,
  maxQuantity: 20
});

export const SHIPPING_OPTIONS = Object.freeze([
  Object.freeze({ id: 'standard', label: 'Estándar nacional', priceCentavos: 25000 }),
  Object.freeze({ id: 'express', label: 'Express nacional', priceCentavos: 34900 })
]);

function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} debe ser un entero no negativo en centavos`);
  }
}

export function roundDivide(numerator, denominator) {
  requireNonNegativeInteger(numerator, 'Numerador');
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new TypeError('Denominador debe ser un entero positivo');
  }
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function calculateCheckoutTotals(lines, shippingCentavos) {
  requireNonNegativeInteger(shippingCentavos, 'Envío');
  const productSubtotalCentavos = lines.reduce((subtotal, line) => {
    requireNonNegativeInteger(line.unitPriceCentavos, 'Precio unitario');
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > CHECKOUT_CONFIG.maxQuantity) {
      throw new RangeError(`Cantidad debe estar entre 1 y ${CHECKOUT_CONFIG.maxQuantity}`);
    }
    const lineTotal = line.unitPriceCentavos * line.quantity;
    if (!Number.isSafeInteger(lineTotal)) throw new RangeError('Total de línea fuera de rango');
    return subtotal + lineTotal;
  }, 0);
  requireNonNegativeInteger(productSubtotalCentavos, 'Subtotal');
  const finalTotalCentavos = productSubtotalCentavos + shippingCentavos;
  const ivaCentavos = roundDivide(
    finalTotalCentavos * CHECKOUT_CONFIG.ivaBasisPoints,
    10_000 + CHECKOUT_CONFIG.ivaBasisPoints
  );
  const taxableBaseCentavos = finalTotalCentavos - ivaCentavos;
  return {
    productSubtotalCentavos,
    shippingCentavos,
    taxableBaseCentavos,
    ivaCentavos,
    finalTotalCentavos
  };
}

export function normalizeCart(candidate, stockByCode) {
  if (!Array.isArray(candidate) || !(stockByCode instanceof Map)) return [];
  const merged = new Map();
  for (const line of candidate) {
    if (!line || typeof line.code !== 'string') continue;
    const available = stockByCode.get(line.code);
    if (!Number.isSafeInteger(available) || available < 1) continue;
    const parsed = Number(line.quantity);
    if (!Number.isInteger(parsed) || parsed < 1) continue;
    const limit = Math.min(available, CHECKOUT_CONFIG.maxQuantity);
    merged.set(line.code, Math.min((merged.get(line.code) || 0) + parsed, limit));
  }
  return [...merged].map(([code, quantity]) => ({ code, quantity }));
}

export function updateQuantity(cart, code, quantity, stockByCode) {
  if (!Array.isArray(cart) || typeof code !== 'string') throw new TypeError('Carrito o código inválido');
  if (!Number.isInteger(quantity)) throw new TypeError('Cantidad inválida');
  if (!(stockByCode instanceof Map)) throw new TypeError('Inventario inválido');
  const next = cart.filter((line) => line.code !== code).map((line) => ({ ...line }));
  const available = stockByCode.get(code);
  if (quantity > 0 && Number.isSafeInteger(available) && available > 0) {
    next.push({ code, quantity: Math.min(quantity, available, CHECKOUT_CONFIG.maxQuantity) });
  }
  return next;
}

export function formatMxn(centavos) {
  requireNonNegativeInteger(centavos, 'Importe');
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2
  }).format(centavos / 100);
}
