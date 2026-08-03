#!/usr/bin/env python3
import json
import re
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
HERO_NOTICE = "Exclusivamente para investigación y referencia analítica."
PRICING_NOTICE = "Precios incluyen IVA. Envío se calcula al pagar."
RESEARCH_EXPLAINER = [
    "¿Qué significa “péptido de investigación”?",
    "Algunas moléculas de nuestro catálogo continúan siendo estudiadas por la comunidad científica en etapas preclínicas o clínicas. Otras comparten ingredientes activos con medicamentos ya autorizados en determinadas presentaciones y jurisdicciones.",
    "La clasificación de investigación corresponde específicamente al material ofrecido por Mereon y no implica registro sanitario, equivalencia farmacéutica ni aprobación para una indicación terapéutica. Consulta la ficha técnica y la documentación de cada producto para conocer su condición particular.",
]


class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.hrefs = []
        self.local_assets = []
        self.script_sources = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "a" and attrs.get("href"):
            self.hrefs.append(attrs["href"])
        if tag in {"img", "script"} and attrs.get("src"):
            self.local_assets.append(attrs["src"])
        if tag == "link" and attrs.get("href") and attrs.get("rel") in {"stylesheet", "icon"}:
            self.local_assets.append(attrs["href"])


class StaticSiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.js = (ROOT / "script.js").read_text(encoding="utf-8")
        cls.css = (ROOT / "styles.css").read_text(encoding="utf-8")
        cls.catalog = json.loads((ROOT / "data/catalog.json").read_text(encoding="utf-8"))
        cls.parser = SiteParser()
        cls.parser.feed(cls.html)

    def test_research_and_pricing_notices_are_concise(self):
        hero = self.html.split('<section class="hero"', 1)[1].split('</section>', 1)[0]
        catalog_heading = self.html.split('<div class="section-heading">', 1)[1].split('</div>\n      <div class="catalog-toolbar"', 1)[0]
        self.assertIn(f'<p class="hero__note">{HERO_NOTICE}</p>', hero)
        self.assertIn(f'<p>{PRICING_NOTICE}</p>', catalog_heading)
        self.assertNotIn("No son medicamentos, suplementos ni productos para uso humano", hero)
        self.assertNotIn("El checkout permanece como vista previa y no transmite pedidos", self.html)
        self.assertNotIn("Pedido no enviado", self.html + self.js)
        self.assertNotIn("Estimaciones de lanzamiento", self.html)
        self.assertRegex(self.html, r"data-payment-button disabled")

    def test_research_peptide_explainer_is_exact_and_accessible(self):
        explainer = self.html.split('id="research-explainer"', 1)[1].split('</dialog>', 1)[0]
        for phrase in RESEARCH_EXPLAINER:
            self.assertEqual(explainer.count(phrase), 1)
        self.assertIn('data-research-open aria-haspopup="dialog" aria-controls="research-explainer"', self.html)
        self.assertIn('aria-labelledby="research-explainer-title"', self.html)
        self.assertIn('data-research-close aria-label="Cerrar explicación" autofocus', explainer)
        self.assertIn("researchDialog.showModal()", self.js)
        self.assertIn("researchDialog.close()", self.js)
        self.assertIn("researchDialog.addEventListener('close', () => researchTrigger.focus())", self.js)

    def test_mereon_verified_is_consistent_across_catalog_and_quality_copy(self):
        required = [
            "Mereon Verified™",
            "origen estadounidense",
            "abastecimiento",
            "pruebas independientes",
            "identidad y pureza",
            "trazabilidad",
            "selección Mereon",
        ]
        for phrase in required:
            self.assertIn(phrase.lower(), self.html.lower())
        self.assertIn("cuando están publicados", self.html.lower())
        self.assertIn("únicamente en referencias con un coa publicado y revisable", self.html.lower())
        self.assertIn("las referencias pendientes no muestran el sello", self.html.lower())
        self.assertIn("estado documental del lote", self.js.lower())
        self.assertIn('class="mereon-verified-badge"', self.js)
        self.assertIn('class="mereon-verified-note"', self.js)
        self.assertNotRegex(self.html, r"(?i)ning[uú]n producto recibe (?:este|el) sello")

    def test_research_peptide_catalog_leads_the_page(self):
        hero = self.html.split('<section class="hero"', 1)[1].split('</section>', 1)[0]
        self.assertIn("Tu salud merece <em>prioridad.</em>", hero)
        self.assertRegex(hero, r"(?i)p[eé]ptidos de investigaci[oó]n")
        self.assertIn('href="#catalogo"', hero)
        self.assertLess(self.html.index('id="catalogo"'), self.html.index('id="calidad"'))

        public_copy = "\n".join([self.html, self.js, json.dumps(self.catalog, ensure_ascii=False)])
        for rejected in [
            "acompañamiento",
            "evaluación inicial",
            "plan personalizado",
            "seguimiento",
            "contacto continuo",
            "apoyo en cada etapa",
            "programa integral",
            "programas integrales",
            "gobierno clínico",
            "ejercicio y nutrición",
            "acompañamiento humano",
        ]:
            self.assertNotIn(rejected, public_copy.lower())

        self.assertNotIn("antes de iva", public_copy.lower())
        self.assertIn(PRICING_NOTICE, self.html)

    def test_navigation_prioritizes_catalog_and_supports_mobile_menu(self):
        self.assertIn('class="nav-toggle"', self.html)
        self.assertIn('aria-controls="primary-nav"', self.html)
        self.assertIn('id="primary-nav"', self.html)
        for destination in ["#catalogo", "#calidad", "#faq"]:
            self.assertIn(f'href="{destination}"', self.html)
        self.assertIn("navToggle.addEventListener", self.js)
        self.assertIn("aria-expanded", self.js)

    def test_checkout_lines_are_in_required_order(self):
        labels = ["Subtotal de productos", "Envío", "IVA incluido (16%)", "Total final"]
        totals = self.html.split('<dl class="totals"', 1)[1].split('</dl>', 1)[0]
        positions = [totals.index(label) for label in labels]
        self.assertEqual(positions, sorted(positions))
        pricing = (ROOT / "pricing.js").read_text()
        self.assertIn("finalTotalCentavos * PRICING_CONFIG.ivaBasisPoints", pricing)
        self.assertIn("10_000 + PRICING_CONFIG.ivaBasisPoints", pricing)

    def test_catalog_is_canonical_and_complete(self):
        products = self.catalog["products"]
        self.assertEqual(len(products), 12)
        self.assertEqual(len({product["code"] for product in products}), 12)
        self.assertTrue(all(product["status"] in {"available", "evaluation", "coa_pending"} for product in products))
        for product in products:
            if product["status"] != "evaluation":
                self.assertIsInstance(product["sourceUsdCents"], int)
                self.assertIsInstance(product["basePriceCentavos"], int)
                self.assertGreater(product["basePriceCentavos"], 0)
                image = product["image"]
                self.assertTrue(image["assetPath"].startswith("assets/images/products/"))
                self.assertTrue((ROOT / image["assetPath"]).is_file())
                image_source = urlparse(image["sourceUrl"])
                self.assertEqual(image_source.scheme, "https")
                self.assertEqual(image_source.netloc, "ascensionpeptides.com")
                self.assertIn("no implica afiliación o autorización", image["notice"])
                self.assertEqual(product["brandSupplier"]["brand"], "Ascension Peptides")
                self.assertIn("no implica afiliación", product["brandSupplier"]["notice"])
        self.assertIn('product.image?.assetPath', self.js)
        self.assertIn('Fotografía de referencia de la fuente', self.js)
        self.assertIn('Plataforma comercial', self.js)

    def test_ascension_source_prices_formula_outputs_and_uniform_images(self):
        expected = {
            "BPC-157-10": (4900, 135000),
            "TB500-5": (5400, 150000),
            "MOTSC-10": (4900, 135000),
            "GHKCU-100-3ML": (6500, 180000),
            "CJCIPA-5-5": (7000, 190000),
            "TA1-10": (7100, 195000),
            "TESA-5": (5000, 135000),
            "EPITHALON-10": (4400, 120000),
            "KPV-10": (5000, 135000),
            "GLOW-70": (12500, 345000),
            "KLOW-80": (12500, 345000),
            "WOLVERINE-10-10": (9000, 245000),
        }
        products = {product["code"]: product for product in self.catalog["products"]}
        self.assertEqual(set(products), set(expected))
        for code, (usd_cents, mxn_centavos) in expected.items():
            product = products[code]
            self.assertEqual(product["brandSupplier"]["brand"], "Ascension Peptides")
            self.assertEqual(product["sourceUsdCents"], usd_cents)
            self.assertEqual(product["basePriceCentavos"], mxn_centavos)
            self.assertTrue(product["source"]["priceEvidenceUrl"].startswith("https://ascensionpeptides.com/product/"))

        for product in self.catalog["products"]:
            image_path = ROOT / product["image"]["assetPath"]
            with image_path.open("rb") as image_file:
                header = image_file.read(24)
            self.assertEqual(header[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", header[16:24]), (800, 800), product["code"])
        self.assertIn("object-fit: contain", self.css)

    def test_coa_links_and_metadata_are_fail_closed(self):
        status_counts = {"available": 0, "coa_pending": 0}
        for product in self.catalog["products"]:
            coa = product["coa"]
            if product["status"] == "available":
                status_counts["available"] += 1
                self.assertIsNotNone(coa, product["code"])
                parsed = urlparse(coa["url"])
                self.assertEqual(parsed.scheme, "https")
                self.assertEqual(parsed.netloc, "ascensionpeptides.com")
                self.assertTrue(parsed.path.startswith("/wp-content/uploads/"))
                self.assertTrue(parsed.path.endswith(".pdf"))
                self.assertEqual(coa["kind"], "source-reference")
                self.assertTrue(coa["lot"] and coa["lab"] and coa["methods"])
                self.assertRegex(coa["sourceSha256"], r"^[0-9a-f]{64}$")
            elif product["status"] == "coa_pending":
                status_counts["coa_pending"] += 1
                self.assertIsNotNone(coa)
                self.assertEqual(coa["kind"], "pending")
                self.assertIsNone(coa["url"])
                self.assertIsNone(coa["lot"])
                self.assertIsNone(coa["lab"])
                self.assertEqual(coa["methods"], [])
                self.assertEqual(coa["label"], "COA pendiente de publicación por Ascension Peptides para esta referencia.")
            else:
                self.assertIsNone(coa)
        self.assertEqual(status_counts, {"available": 10, "coa_pending": 2})
        self.assertIn("COA no publicado por la fuente", self.js)

    def test_stale_suppliers_are_absent_from_live_catalog_and_frontend(self):
        live_surface = "\n".join([
            json.dumps(self.catalog, ensure_ascii=False),
            self.html,
            self.js,
            self.css,
        ])
        self.assertNotRegex(live_surface, r"(?i)\bprotide\b")
        self.assertNotRegex(live_surface, r"(?i)\blimitless(?: biotech)?\b")

    def test_internal_anchors_and_local_assets_resolve(self):
        broken = [href for href in self.parser.hrefs if href.startswith("#") and href[1:] not in self.parser.ids]
        self.assertEqual(broken, [])
        missing = []
        for source in self.parser.local_assets:
            if source.startswith(("http://", "https://", "data:")):
                continue
            if not (ROOT / source.split("?", 1)[0]).is_file():
                missing.append(source)
        self.assertEqual(missing, [])

    def test_no_supplier_media_or_brand_claims_in_frontend(self):
        frontend = "\n".join([self.html, self.js, self.css])
        self.assertNotIn("wp-content/uploads", frontend)
        self.assertNotRegex(frontend, r"(?i)authorized\s+reseller|revendedor\s+autorizado|tienda\s+oficial")
        self.assertNotRegex(frontend, r"(?i)the best in the industry|highest purity|la mejor pureza|competidores (?:fallan|incumplen)")
        self.assertNotRegex(frontend, r"(?i)\b(?:dosis|ciclo|reconstituci[oó]n|inyecci[oó]n|inyectar)\b")
        self.assertNotRegex(frontend, r"(?i)\b(?:cura|garantiza resultados|pérdida de peso|anti-aging)\b")

    def test_external_runtime_links_are_safe(self):
        self.assertIn('target="_blank" rel="noopener noreferrer"', self.js)
        self.assertNotIn("fetch('http", self.js)
        self.assertNotIn('fetch("http', self.js)

    def test_responsive_overflow_guards_exist(self):
        self.assertIn("overflow-x: hidden", self.css)
        self.assertIn("@media (max-width: 700px)", self.css)
        self.assertIn("@media (max-width: 350px)", self.css)
        self.assertIn("min-width: 0", self.css)


if __name__ == "__main__":
    unittest.main(verbosity=2)
