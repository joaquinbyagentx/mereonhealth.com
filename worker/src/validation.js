const LIMITS = Object.freeze({ fullName: 120, email: 254, phone: 18, address1: 160, interior: 40, colonia: 100, municipality: 100, city: 100, state: 3, postalCode: 5, country: 2, notes: 500 });
const MONEY_FIELDS = new Set(['price', 'unitPrice', 'unitAmount', 'subtotal', 'shipping', 'shippingAmount', 'iva', 'tax', 'total', 'amount']);

function fail(label = 'Solicitud inválida') { throw new Error(label); }
function text(value, field, required = true) {
  if (typeof value !== 'string') fail(`${field} inválido`);
  const clean = value.trim().replace(/\s+/g, ' ');
  if ((required && !clean) || clean.length > LIMITS[field]) fail(`${field} inválido`);
  return clean;
}
function hasForbiddenMoney(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.keys(value).some((key) => MONEY_FIELDS.has(key) || hasForbiddenMoney(value[key]));
}

export function validateCheckoutRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || hasForbiddenMoney(input)) fail();
  if (input.currency !== 'mxn') fail('Moneda inválida');
  if (!['standard', 'express'].includes(input.shippingId)) fail('Envío inválido');
  if (input.ruoAccepted !== true) fail('Debes aceptar el uso exclusivo para investigación');
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 8) fail('Carrito inválido');
  const seen = new Set();
  const lines = input.lines.map((line) => {
    if (!line || typeof line.code !== 'string' || !/^[A-Z0-9-]{2,30}$/.test(line.code) || seen.has(line.code)) fail('Producto duplicado o inválido');
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) fail('Cantidad inválida');
    seen.add(line.code);
    return { code: line.code, quantity: line.quantity };
  });
  const source = input.customer;
  if (!source || typeof source !== 'object') fail('Cliente inválido');
  const customer = {
    fullName: text(source.fullName, 'fullName'), email: text(source.email, 'email').toLowerCase(),
    phone: text(source.phone, 'phone').replace(/[\s().-]/g, ''), address1: text(source.address1, 'address1'),
    interior: text(source.interior ?? '', 'interior', false), colonia: text(source.colonia, 'colonia'),
    municipality: text(source.municipality, 'municipality'), city: text(source.city, 'city'),
    state: text(source.state, 'state').toUpperCase(), postalCode: text(source.postalCode, 'postalCode'),
    country: text(source.country, 'country').toUpperCase(), notes: text(source.notes ?? '', 'notes', false)
  };
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]{2,}$/.test(customer.email)) fail('Email inválido');
  const digits = customer.phone.replace(/^\+/, '');
  if (!/^(52)?\d{10}$/.test(digits)) fail('Teléfono inválido');
  customer.phone = `+${digits.startsWith('52') ? digits : `52${digits}`}`;
  if (!/^\d{5}$/.test(customer.postalCode)) fail('Código postal inválido');
  if (!/^[A-Z]{2,3}$/.test(customer.state)) fail('Estado inválido');
  if (customer.country !== 'MX') fail('País inválido; sólo México');
  return Object.freeze({ currency: 'mxn', shippingId: input.shippingId, lines, customer: Object.freeze(customer), ruoAccepted: true });
}
