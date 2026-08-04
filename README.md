# Mereon Health — catálogo de materiales de investigación

Sitio estático, consumer-facing y research-use-only para GitHub Pages. Incluye 14 referencias, fichas documentales, inventario explícito, carrito persistente y un checkout con datos mínimos de entrega hacia Stripe Checkout alojado.

## Desarrollo

Requisitos: Python 3.9+ y Node.js 22+.

```bash
npm install
npm test
npm run test:backend
npm run test:browser
```

## Importador público

`npm run catalog:import` consulta la Store API, el indicador oficial del DOF y las páginas públicas de producto/COA configuradas en `scripts/import_catalog.py`, valida los campos esperados y genera `data/catalog.json`. `npm run catalog:check` valida las fuentes actuales sin modificar el dataset.

La fuente pública se utiliza únicamente como investigación de catálogo. El inventario vendible y sus precios proceden de la primera orden de proveedor revisada internamente; el importador no los sustituye por precios públicos posteriores. Las otras seis referencias se conservan visibles con existencias en cero. Mereon no declara afiliación, autorización de reventa ni relación oficial con el catálogo de origen. Las fotografías oficiales de producto se espejan localmente como referencia visual, con atribución visible a la fuente; los certificados no se copian. Los enlaces de COA llevan al documento público externo y se etiquetan como referencia de la fuente, no como COA de un lote Mereon.

El importador falla si cambia un campo obligatorio, una presentación deja de coincidir, el precio deja de ser USD válido, un COA configurado ya no responde o sus metadatos públicos dejan de poder verificarse. Una categoría realmente ausente se normaliza como `evaluation` en lugar de inventarse.

## Precios y checkout

Toda la aritmética monetaria está en centavos/centavos enteros:

- FX USD/MXN publicado por Banco de México/DOF para 2026-08-03: 17.3288.
- Los precios vendibles se generan y prueban con la política interna de costo aterrizado; sus componentes económicos no se publican en el catálogo del navegador.
- Precio final al comprador redondeado al múltiplo de MXN 50 más cercano, con empate hacia arriba. No se agrega un factor IVA separado; el checkout desglosa el IVA incluido dentro del precio final mostrado.
- Envío estándar final: MXN 250 con IVA incluido.
- Envío express final: MXN 349 con IVA incluido.
- El total es exactamente subtotal de productos + envío. El IVA se extrae como dato informativo mediante `total × 16 / 116`; nunca se suma otra vez.

El dataset servido al navegador omite los costos unitarios, el número de orden y los supuestos de markup; la interfaz no los muestra al cliente.

## Límite de pago y datos

`payment-adapter.js` habla únicamente con `https://api.mereonhealth.com`, envía códigos/cantidades y datos mínimos de entrega validados, y sólo permite redirigir a una URL HTTPS de `checkout.stripe.com` con identificador de Session live. Nunca recibe precios del navegador ni maneja datos de tarjeta. El Worker conserva catálogo, precios, IVA incluido e inventario canónicos, reserva existencias en un Durable Object/D1 y confirma pago sólo tras un webhook Stripe live firmado.

La confirmación pública usa un token aleatorio de 256 bits y no expone contacto ni domicilio. Los secretos son bindings cifrados del Worker y no se almacenan en el navegador. Provisionamiento, verificación sin cargo y recuperación: `docs/checkout-runbook.md`.
