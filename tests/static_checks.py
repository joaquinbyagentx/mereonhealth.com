#!/usr/bin/env python3
import hashlib
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
CATALOG_CLARIFICATION = (
    "Las descripciones presentan áreas estudiadas en investigación preclínica y no establecen eficacia, seguridad ni una indicación terapéutica. "
    "Los materiales ofrecidos por Mereon son exclusivamente para investigación."
)


class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.hrefs = []
        self.local_assets = []
        self.script_sources = []
        self.text = []

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

    def handle_data(self, data):
        self.text.append(data)


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

    def test_official_logo_is_used_in_header_and_footer(self):
        logo_path = "assets/mereon-logo.svg"
        self.assertEqual(self.html.count(f'src="{logo_path}"'), 2)
        self.assertEqual(self.html.count('aria-label="Mereon, inicio"'), 2)
        self.assertNotIn('<span>MEREON</span><small>HEALTH</small>', self.html)

        logo = (ROOT / logo_path).read_text(encoding="utf-8")
        self.assertIn('viewBox="0 0 268 91"', logo)
        self.assertIn('aria-hidden="true"', logo)
        self.assertNotIn("<rect", logo, "the transparent logo must not carry a background block")
        self.assertRegex(logo, r'<circle[^>]+stroke="(?:#fff|white)"')
        self.assertIn('data-wordmark="Mereon"', logo)

    def test_legal_routes_preserve_approved_source_and_metadata(self):
        routes = {
            "terminos": {
                "source": "TERMINOS.md",
                "title": "Términos y Condiciones — Mereon Health",
                "description": "Términos y condiciones de compra y uso de Mereon Health para materiales de investigación y referencia analítica.",
                "headings": ["Aviso importante (Research Use Only — RUO)", "6. Política de devoluciones, reembolsos y garantía", "Contacto"],
            },
            "privacidad": {
                "source": "AVISO-DE-PRIVACIDAD.md",
                "title": "Aviso de Privacidad — Mereon Health",
                "description": "Aviso de privacidad integral de Mereon Health para el tratamiento de datos personales en mereonhealth.com.",
                "headings": ["1. Responsable del tratamiento", "5. Derechos ARCO", "7. Aviso de privacidad integral"],
            },
        }
        for route, expected in routes.items():
            legal_path = ROOT / route / "index.html"
            self.assertTrue(legal_path.is_file(), f"/{route}/ must have a source page")
            html = legal_path.read_text(encoding="utf-8")
            parser = SiteParser()
            parser.feed(html)
            visible_text = " ".join("".join(parser.text).split())
            source = (ROOT / "legal" / expected["source"]).read_text(encoding="utf-8")

            self.assertIn('<html lang="es-MX">', html)
            self.assertIn('<meta name="viewport" content="width=device-width, initial-scale=1">', html)
            self.assertIn(f'<title>{expected["title"]}</title>', html)
            self.assertIn(f'<meta name="description" content="{expected["description"]}">', html)
            self.assertIn(f'<link rel="canonical" href="https://mereonhealth.com/{route}/">', html)
            self.assertEqual(html.count("<h1"), 1)
            self.assertEqual(html.count('src="../assets/mereon-logo.svg"'), 2)
            self.assertIn('href="../">Volver a la tienda</a>', html)
            self.assertIn('href="../terminos/">Términos y condiciones</a>', html)
            self.assertIn('href="../privacidad/">Aviso de privacidad</a>', html)
            self.assertIn("Solo para investigación y referencia analítica.", visible_text)
            for heading in expected["headings"]:
                self.assertIn(heading, visible_text)

            # Every approved non-separator source line must survive as visible text;
            # only Markdown punctuation may be removed by mechanical HTML formatting.
            for line in source.splitlines():
                line = line.strip()
                if not line or line == "---":
                    continue
                plain = re.sub(r"^#{1,6}\s+|^-\s+", "", line)
                plain = plain.replace("**", "").replace("`", "")
                self.assertIn(" ".join(plain.split()), visible_text, f"missing approved text in /{route}/: {plain}")

    def test_storefront_footer_and_checkout_link_to_legal_routes(self):
        footer = self.html.split("<footer>", 1)[1].split("</footer>", 1)[0]
        self.assertIn('href="terminos/">Términos y condiciones</a>', footer)
        self.assertIn('href="privacidad/">Aviso de privacidad</a>', footer)
        acceptance = self.html.split('<label class="ruo-acceptance">', 1)[1].split("</label>", 1)[0]
        self.assertIn('input name="ruoAccepted" type="checkbox" required', acceptance)
        self.assertIn('href="terminos/">Términos y condiciones</a>', acceptance)
        self.assertIn('href="privacidad/">Aviso de privacidad</a>', acceptance)
        self.assertIn("ruoAccepted: form.get('ruoAccepted') === 'on'", self.js)


    def test_research_peptide_explainer_is_exact_and_accessible(self):
        for phrase in RESEARCH_EXPLAINER:
            self.assertEqual(self.html.count(phrase), 1)
        faq_items = self.html.split('<div class="faq__items"', 1)[1].split('</div>\n    </section>', 1)[0]
        self.assertTrue(faq_items.rstrip().endswith('</details>'))
        final_faq = faq_items.rsplit('<details', 1)[1]
        for phrase in RESEARCH_EXPLAINER:
            self.assertEqual(final_faq.count(phrase), 1)
        self.assertIn('data-research-open aria-haspopup="dialog" aria-controls="research-explainer"', self.html)
        self.assertIn('aria-labelledby="research-explainer-title"', self.html)
        self.assertIn('data-research-close aria-label="Cerrar explicación" autofocus', self.html)
        self.assertIn("researchDialog.showModal()", self.js)
        self.assertIn("researchDialog.close()", self.js)
        self.assertIn("researchDialog.addEventListener('close', () => researchTrigger.focus())", self.js)

    def test_catalog_clarification_appears_exactly_once(self):
        self.assertEqual(self.html.count(CATALOG_CLARIFICATION), 1)
        catalog = self.html.split('<section class="catalog section"', 1)[1].split('</section>', 1)[0]
        self.assertIn(CATALOG_CLARIFICATION, catalog)

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
        self.assertIn("designación propia de mereon para productos actualmente disponibles", self.html.lower())
        self.assertIn("no equivale a un coa", self.html.lower())
        self.assertIn("no sustituye ni implica un coa publicado", self.html.lower())
        self.assertIn("el estado del coa se muestra por separado", self.js.lower())
        self.assertIn("product.purchaseEnabled === true", self.js)
        self.assertIn('class="mereon-verified-badge"', self.js)
        self.assertIn('class="mereon-verified-note"', self.js)
        self.assertNotIn("product.status === 'available'\n      ? '<span class=\"mereon-verified-badge\"", self.js)

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
        labels = ["Subtotal de productos", "Envío", "De este total, IVA incluido (16%)", "Total final"]
        totals = self.html.split('<dl class="totals"', 1)[1].split('</dl>', 1)[0]
        positions = [totals.index(label) for label in labels]
        self.assertEqual(positions, sorted(positions))
        pricing = (ROOT / "pricing.js").read_text()
        self.assertIn("finalTotalCentavos * CHECKOUT_CONFIG.ivaBasisPoints", pricing)
        self.assertIn("10_000 + CHECKOUT_CONFIG.ivaBasisPoints", pricing)

    def test_catalog_is_canonical_and_complete(self):
        products = self.catalog["products"]
        self.assertEqual(len(products), 16)
        self.assertEqual(len({product["code"] for product in products}), 16)
        self.assertTrue(all(isinstance(product["stockQuantity"], int) and product["stockQuantity"] >= 0 for product in products))
        self.assertTrue(all(isinstance(product["purchaseEnabled"], bool) for product in products))
        self.assertEqual(
            {product["code"] for product in products if product["purchaseEnabled"] and product["stockQuantity"] > 0},
            {product["code"] for product in products if product["stockQuantity"] > 0},
        )
        self.assertTrue(all(product["status"] in {"available", "evaluation", "coa_pending"} for product in products))
        for product in products:
            if product["status"] != "evaluation":
                self.assertIsInstance(product["basePriceCentavos"], int)
                self.assertGreater(product["basePriceCentavos"], 0)
                image = product["image"]
                self.assertTrue(image["assetPath"].startswith("assets/images/products/"))
                self.assertTrue((ROOT / image["assetPath"]).is_file())
                image_source = urlparse(image["sourceUrl"])
                self.assertEqual(image_source.scheme, "https")
                self.assertIn(image_source.netloc, {"ascensionpeptides.com", "protidehealth.com"})
                self.assertIn("no implica afiliación o autorización", image["notice"])
                expected_brand = "Protide Health" if product["code"] == "SERMORELIN-5" else "Ascension Peptides"
                self.assertEqual(product["brandSupplier"]["brand"], expected_brand)
                self.assertIn("no implica afiliación", product["brandSupplier"]["notice"])
        self.assertIn('product.image?.assetPath', self.js)
        self.assertIn('Fotografía de referencia de la fuente', self.js)
        self.assertIn('Plataforma comercial', self.js)

    def test_order_backed_prices_inventory_and_uniform_images(self):
        expected = {
            "T-10": (4850, 3, 155000),
            "BPC-157-10": (4900, 1, 160000),
            "SEMAX-10": (5999, 3, 180000),
            "GHKCU-100-10ML": (7500, 1, 210000),
            "CJCIPA-5-5": (7000, 1, 200000),
            "TA1-10": (7100, 1, 200000),
            "IPAMORELIN-5": (4400, 1, 150000),
            "TESA-5": (5000, 1, 160000),
            "KLOW-80": (12500, 1, 305000),
        }
        products = {product["code"]: product for product in self.catalog["products"]}
        self.assertEqual({code for code, product in products.items() if product["stockQuantity"] > 0}, set(expected))
        for code, (usd_cents, stock, mxn_centavos) in expected.items():
            product = products[code]
            self.assertEqual(product["brandSupplier"]["brand"], "Ascension Peptides")
            self.assertEqual(product["stockQuantity"], stock)
            self.assertEqual(product["basePriceCentavos"], mxn_centavos)
            self.assertNotIn("sourceUsdCents", product)
            self.assertNotIn("profitMarkupBasisPoints", product)
            self.assertTrue(product["source"]["priceEvidenceUrl"].startswith("https://ascensionpeptides.com/product/"))

        for product in self.catalog["products"]:
            image_path = ROOT / product["image"]["assetPath"]
            with image_path.open("rb") as image_file:
                header = image_file.read(24)
            self.assertEqual(header[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", header[16:24]), (800, 800), product["code"])
        self.assertIn("object-fit: contain", self.css)

        sermorelin = products["SERMORELIN-5"]
        self.assertEqual(sermorelin["basePriceCentavos"], 170000)
        self.assertNotEqual(sermorelin["basePriceCentavos"], 155000)
        self.assertEqual(sermorelin["stockQuantity"], 0)
        self.assertFalse(sermorelin["purchaseEnabled"])
        sermorelin_image = ROOT / sermorelin["image"]["assetPath"]
        self.assertEqual(hashlib.sha256(sermorelin_image.read_bytes()).hexdigest(), sermorelin["image"]["localizedSha256"])

    def test_coa_links_and_metadata_are_fail_closed(self):
        status_counts = {"available": 0, "coa_pending": 0}
        for product in self.catalog["products"]:
            coa = product["coa"]
            if product["status"] == "available":
                status_counts["available"] += 1
                self.assertIsNotNone(coa, product["code"])
                parsed = urlparse(coa["url"])
                self.assertEqual(parsed.scheme, "https")
                self.assertIn(parsed.netloc, {"ascensionpeptides.com", "protidehealth.com"})
                self.assertTrue(parsed.path.startswith("/wp-content/uploads/"))
                self.assertTrue(parsed.path.endswith(".pdf"))
                self.assertEqual(coa["kind"], "source-reference")
                self.assertTrue(coa["lot"] and coa["lab"])
                self.assertIsInstance(coa["methods"], list)
                self.assertRegex(coa["sourceSha256"], r"^[0-9a-f]{64}$")
                if product["code"] == "SERMORELIN-5":
                    self.assertEqual(coa["assetPath"], "assets/documents/sermorelin-5-coa-2605280407.pdf")
                    local_coa = ROOT / coa["assetPath"]
                    self.assertTrue(local_coa.is_file())
                    self.assertTrue(local_coa.read_bytes().startswith(b"%PDF-"))
                    self.assertEqual(hashlib.sha256(local_coa.read_bytes()).hexdigest(), coa["sourceSha256"])
            elif product["status"] == "coa_pending":
                status_counts["coa_pending"] += 1
                self.assertIsNotNone(coa)
                self.assertEqual(coa["kind"], "pending")
                self.assertIsNone(coa["url"])
                self.assertIsNone(coa["lot"])
                self.assertIsNone(coa["lab"])
                self.assertEqual(coa["methods"], [])
                expected_label = (
                    "COA de referencia pendiente de revisión por Mereon."
                    if product["code"] in {"T-10", "IPAMORELIN-5", "GHKCU-100-10ML"}
                    else "COA pendiente de publicación por Ascension Peptides para esta referencia."
                )
                self.assertEqual(coa["label"], expected_label)
            else:
                self.assertIsNone(coa)
        self.assertEqual(status_counts, {"available": 12, "coa_pending": 4})
        self.assertIn("COA no publicado por la fuente", self.js)

    def test_only_current_suppliers_are_present_in_live_catalog_and_frontend(self):
        live_surface = "\n".join([
            json.dumps(self.catalog, ensure_ascii=False),
            self.html,
            self.js,
            self.css,
        ])
        self.assertNotRegex(live_surface, r"(?i)\blimitless(?: biotech)?\b")
        protide = [product for product in self.catalog["products"] if product["brandSupplier"]["brand"] == "Protide Health"]
        self.assertEqual([product["code"] for product in protide], ["SERMORELIN-5"])

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
