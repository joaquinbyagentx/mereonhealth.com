export const PRICING_CONFIG = Object.freeze({
  fxMxnCentavosPerUsd: 1750,
  landedUpliftBasisPoints: 1300,
  targetProfitMarkupBasisPoints: 3500,
  acceptedProfitMarkupRangeBasisPoints: Object.freeze([3450, 3550]),
  cleanPriceIncrementCentavos: 1000,
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

export function calculateBasePriceCentavos(sourceUsdCents) {
  requireNonNegativeInteger(sourceUsdCents, 'Costo fuente USD');
  const numerator = sourceUsdCents
    * PRICING_CONFIG.fxMxnCentavosPerUsd
    * (10_000 + PRICING_CONFIG.landedUpliftBasisPoints)
    * (10_000 + PRICING_CONFIG.targetProfitMarkupBasisPoints);
  const denominator = 100 * 10_000 * 10_000;
  const cleanUnits = roundDivide(
    numerator,
    denominator * PRICING_CONFIG.cleanPriceIncrementCentavos
  );
  return cleanUnits * PRICING_CONFIG.cleanPriceIncrementCentavos;
}

export function calculateProfitMarkupBasisPoints(sourceUsdCents, basePriceCentavos) {
  requireNonNegativeInteger(sourceUsdCents, 'Costo fuente USD');
  requireNonNegativeInteger(basePriceCentavos, 'Precio base');
  if (basePriceCentavos === 0) throw new RangeError('Precio base debe ser mayor a cero');

  const landedNumerator = sourceUsdCents
    * PRICING_CONFIG.fxMxnCentavosPerUsd
    * (10_000 + PRICING_CONFIG.landedUpliftBasisPoints);
  const landedDenominator = 100 * 10_000;
  const profitNumerator = basePriceCentavos * landedDenominator - landedNumerator;
  if (profitNumerator < 0) return -roundDivide(-profitNumerator * 10_000, landedNumerator);
  return roundDivide(profitNumerator * 10_000, landedNumerator);
}

export function calculateCheckoutTotals(lines, shippingCentavos) {
  requireNonNegativeInteger(shippingCentavos, 'Envío');
  const productSubtotalCentavos = lines.reduce((subtotal, line) => {
    requireNonNegativeInteger(line.unitPriceCentavos, 'Precio unitario');
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > PRICING_CONFIG.maxQuantity) {
      throw new RangeError(`Cantidad debe estar entre 1 y ${PRICING_CONFIG.maxQuantity}`);
    }
    const lineTotal = line.unitPriceCentavos * line.quantity;
    if (!Number.isSafeInteger(lineTotal)) throw new RangeError('Total de línea fuera de rango');
    return subtotal + lineTotal;
  }, 0);
  requireNonNegativeInteger(productSubtotalCentavos, 'Subtotal');
  const finalTotalCentavos = productSubtotalCentavos + shippingCentavos;
  const ivaCentavos = roundDivide(
    finalTotalCentavos * PRICING_CONFIG.ivaBasisPoints,
    10_000 + PRICING_CONFIG.ivaBasisPoints
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

export function normalizeCart(candidate, knownCodes) {
  if (!Array.isArray(candidate) || !(knownCodes instanceof Set)) return [];
  const merged = new Map();
  for (const line of candidate) {
    if (!line || typeof line.code !== 'string' || !knownCodes.has(line.code)) continue;
    const parsed = Number(line.quantity);
    if (!Number.isInteger(parsed) || parsed < 1) continue;
    const quantity = Math.min(parsed, PRICING_CONFIG.maxQuantity);
    merged.set(line.code, Math.min((merged.get(line.code) || 0) + quantity, PRICING_CONFIG.maxQuantity));
  }
  return [...merged].map(([code, quantity]) => ({ code, quantity }));
}

export function updateQuantity(cart, code, quantity) {
  if (!Array.isArray(cart) || typeof code !== 'string') throw new TypeError('Carrito o código inválido');
  if (!Number.isInteger(quantity)) throw new TypeError('Cantidad inválida');
  const next = cart.filter((line) => line.code !== code).map((line) => ({ ...line }));
  if (quantity > 0) next.push({ code, quantity: Math.min(quantity, PRICING_CONFIG.maxQuantity) });
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
