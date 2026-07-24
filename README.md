# Mereon Health

Sitio público de pre-lanzamiento de Mereon Health para México. Presenta el enfoque de calidad, las áreas de portafolio bajo evaluación y el canal oficial para proveedores y alianzas.

## Estado operativo

- Mereon está en fase de sourcing, validación de proveedores y preparación regulatoria.
- El sitio no procesa ventas, pagos, recetas, expedientes, formularios clínicos ni envíos.
- No afirma licencias, proveedores aprobados, productos registrados ni relaciones comerciales que todavía no existan.
- Contacto oficial: `partnerships@mereonhealth.com`.

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
- `script.js`: navegación móvil y año del footer.
- `assets/`: recursos visuales locales.
