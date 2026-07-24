# Mereon Health

Sitio comercial de Mereon Health para consumidores en México. Presenta la marca, sus pilares de bienestar funcional y una guía interactiva de exploración basada únicamente en opciones predeterminadas.

## Alcance

- Experiencia estática en español, sin dependencias externas.
- Catálogo navegable por categorías y guía de preferencias generales.
- Sin formularios, cuentas, pagos, expedientes ni captura de información sensible.

## Deployment

GitHub Pages publica la rama `main` desde la raíz del repositorio. `CNAME` configura `mereonhealth.com`.

Preview local:

```sh
python3 -m http.server 8000
```

Después abrir `http://127.0.0.1:8000/`.

## Archivos principales

- `index.html`: contenido y estructura pública.
- `styles.css`: diseño responsive.
- `script.js`: filtros, navegación móvil y guía de exploración.
- `assets/`: recursos visuales locales.