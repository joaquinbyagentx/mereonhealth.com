const product = (code, name, presentation, unitAmount, initialStock) => Object.freeze({ code, name, presentation, unitAmount, initialStock });

export const CATALOG = Object.freeze(Object.fromEntries([
  product('T-10', 'Tirzepatida (T-10)', '10 mg', 155000, 3),
  product('BPC-157-10', 'BPC-157', '10 mg', 160000, 1),
  product('SEMAX-10', 'Semax', '10 mg', 180000, 3),
  product('KLOW-80', 'KLOW', 'GHK-Cu 50 mg + BPC-157 10 mg + TB-500 10 mg + KPV 10 mg', 305000, 1),
  product('CJCIPA-5-5', 'CJC-1295 No-DAC + Ipamorelin', '5 mg + 5 mg', 200000, 1),
  product('TA1-10', 'Thymosin Alpha 1', '10 mg', 200000, 1),
  product('IPAMORELIN-5', 'Ipamorelin', '5 mg', 150000, 1),
  product('TESA-5', 'Tesamorelin', '5 mg', 160000, 1),
  product('SERMORELIN-5', 'Sermorelin', '5 mg', 170000, 0),
  product('GHKCU-100-10ML', 'GHK-Cu', '100 mg · 10 mL', 210000, 1)
].map((item) => [item.code, item])));

export const SHIPPING = Object.freeze({
  standard: Object.freeze({ id: 'standard', label: 'Envío estándar nacional', unitAmount: 25000 }),
  express: Object.freeze({ id: 'express', label: 'Envío express nacional', unitAmount: 34900 })
});

export function includedIva(total) {
  if (!Number.isSafeInteger(total) || total < 0) throw new TypeError('Total inválido');
  return Math.floor((total * 16 + 58) / 116);
}

export function calculateCanonicalOrder(inputLines, shippingId) {
  const shipping = SHIPPING[shippingId];
  if (!shipping) throw new Error('Envío inválido');
  if (!Array.isArray(inputLines) || inputLines.length < 1 || inputLines.length > 8) throw new Error('Carrito inválido');
  const seen = new Set();
  const lines = inputLines.map(({ code, quantity }) => {
    const item = CATALOG[code];
    if (!item || seen.has(code) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Carrito inválido');
    seen.add(code);
    const lineTotal = item.unitAmount * quantity;
    return Object.freeze({ code, name: item.name, presentation: item.presentation, quantity, unitAmount: item.unitAmount, lineTotal });
  });
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const total = subtotal + shipping.unitAmount;
  const iva = includedIva(total);
  return Object.freeze({ lines, shipping, totals: Object.freeze({ subtotal, shipping: shipping.unitAmount, total, includedIva: iva, taxableBase: total - iva }) });
}
