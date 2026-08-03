# Mereon Health — catálogo de materiales de investigación

Sitio estático, consumer-facing y research-use-only para GitHub Pages. Incluye 12 categorías, fichas documentales, carrito persistente, resumen de envío y un adaptador de pago deliberadamente inactivo.

## Desarrollo

Requisitos: Python 3.9+ y Node.js 22+.

```bash
npm install
npm test
python3 -m http.server 8000 --bind 127.0.0.1
npm run test:browser
```

## Importador público

`npm run catalog:import` consulta la Store API y las páginas públicas de producto/COA configuradas en `scripts/import_catalog.py`, valida los campos esperados y genera `data/catalog.json`. `npm run catalog:check` valida la fuente actual sin modificar el dataset.

La fuente se utiliza únicamente como investigación de catálogo y precios. Mereon no declara afiliación, autorización de reventa ni relación oficial con el catálogo de origen. No se copian logotipos, fotografías ni certificados. Los enlaces de COA llevan al documento público externo y se etiquetan como referencia de la fuente, no como COA de un lote Mereon.

El importador falla si cambia un campo obligatorio, una presentación deja de coincidir, el precio deja de ser USD válido, un COA configurado ya no responde o sus metadatos públicos dejan de poder verificarse. Una categoría realmente ausente se normaliza como `evaluation` en lugar de inventarse.

## Precios y checkout

Toda la aritmética monetaria está en centavos/centavos enteros:

- FX de planeación: MXN 17.50/USD.
- Uplift de costo aterrizado: 13%.
- Fórmula autorizada: precio público Protide convertido a MXN, más 13% de costo puesto y después 35% de ganancia sobre ese costo; rango técnico 34.5–35.5% por el redondeo a precios limpios.
- Precio final al comprador con IVA incluido, redondeado al múltiplo de MXN 10 más cercano, con empate hacia arriba.
- Envío estándar final: MXN 250 con IVA incluido.
- Envío express final: MXN 349 con IVA incluido.
- El resumen desglosa el IVA incluido en productos y envío.

La fuente y los supuestos de costo permanecen en el dataset/código interno y no se muestran como divulgación de proveedor al cliente.

## Límite de pago y datos

`payment-adapter.js` no acepta payloads, no ejecuta solicitudes de red y siempre devuelve `unavailable`. La interfaz no solicita datos de contacto mientras el pago está inactivo.
