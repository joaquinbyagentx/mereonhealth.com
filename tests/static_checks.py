#!/usr/bin/env python3
import json
import re
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_SHORT = "Material de investigación. No es medicamento ni suplemento."
REQUIRED_FULL = "Este compuesto se comercializa exclusivamente como material de investigación y referencia analítica. No ha sido evaluado ni aprobado por COFEPRIS o FDA para indicaciones terapéuticas. Mereon Health no proporciona diagnóstico, prescripción, administración, dosificación ni instrucciones de uso. El comprador es responsable de su almacenamiento, manejo y cumplimiento de las disposiciones aplicables."
REQUIRED_ACCEPTANCE = "Confirmo que soy mayor de edad, que adquiero material de investigación y que entiendo que Mereon Health no lo comercializa como medicamento, suplemento o tratamiento."


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

    def test_required_legal_copy_is_exact_and_visible(self):
        self.assertIn(REQUIRED_SHORT, self.js)
        self.assertIn(REQUIRED_FULL, self.html)
        self.assertIn(REQUIRED_FULL, self.js)
        self.assertIn(REQUIRED_ACCEPTANCE, self.html)
        self.assertRegex(self.html, r"data-payment-button disabled")

    def test_mereon_verified_is_lot_specific_and_complete(self):
        required = [
            "Mereon Verified™",
            "COA del lote",
            "HPLC",
            "LC-MS",
            "Endotoxinas",
            "Laboratorio independiente",
            "Inspección visual",
            "QR verificable",
            "Fecha de recepción",
        ]
        for phrase in required:
            self.assertIn(phrase, self.html)
        self.assertIn("La reputación del fabricante, por sí sola, no sustituye la verificación.", self.html)
        self.assertIn("ningún producto recibe este sello mientras su expediente de lote permanezca incompleto o pendiente", self.html)
        self.assertNotIn("status-badge--verified", self.js)

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
                self.assertIn(image_source.netloc, {"protidehealth.com", "cdn11.bigcommerce.com"})
                self.assertIn("no implica afiliación o autorización", image["notice"])
                self.assertIn(product["brandSupplier"]["brand"], {"Protide Health", "Limitless Biotech"})
                self.assertIn("no implica afiliación", product["brandSupplier"]["notice"])
        self.assertIn('product.image?.assetPath', self.js)
        self.assertIn('Fotografía de referencia de la fuente', self.js)
        self.assertIn('Plataforma comercial', self.js)

    def test_limitless_authenticated_prices_and_uniform_images(self):
        expected = {
            "BPC-157-10": (9999, 267000),
            "TB500-10": (13399, 358000),
            "MOTSC-10": (9999, 267000),
            "TA1-10": (13199, 352000),
        }
        products = {product["code"]: product for product in self.catalog["products"]}
        for code, (usd_cents, mxn_centavos) in expected.items():
            product = products[code]
            self.assertEqual(product["brandSupplier"]["brand"], "Limitless Biotech")
            self.assertEqual(product["sourceUsdCents"], usd_cents)
            self.assertEqual(product["basePriceCentavos"], mxn_centavos)
            self.assertEqual(product["presentation"], "10 mg · vial Premium liofilizado")
            self.assertTrue(product["source"]["priceEvidenceUrl"].startswith("https://limitlesslifenootropics.com/product/"))

        for product in self.catalog["products"]:
            image_path = ROOT / product["image"]["assetPath"]
            with image_path.open("rb") as image_file:
                header = image_file.read(24)
            self.assertEqual(header[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", header[16:24]), (800, 800), product["code"])
        self.assertIn("object-fit: contain", self.css)

    def test_coa_links_and_metadata_are_fail_closed(self):
        for product in self.catalog["products"]:
            coa = product["coa"]
            if product["status"] == "available":
                self.assertIsNotNone(coa, product["code"])
                parsed = urlparse(coa["url"])
                self.assertEqual(parsed.scheme, "https")
                self.assertEqual(parsed.netloc, "protidehealth.com")
                self.assertTrue(parsed.path.startswith("/certificates/"))
                self.assertEqual(coa["kind"], "source-reference")
                self.assertTrue(coa["lot"] and coa["lab"] and coa["methods"])
            elif product["status"] == "coa_pending":
                self.assertIsNotNone(coa)
                self.assertEqual(coa["kind"], "pending")
                self.assertIsNone(coa["url"])
                self.assertIsNone(coa["lot"])
                self.assertIsNone(coa["lab"])
                self.assertEqual(coa["methods"], [])
                self.assertEqual(coa["label"], "COA pendiente de asignación/publicación para este lote.")
            else:
                self.assertIsNone(coa)
        self.assertIn("COA pendiente de asignación/publicación para este lote", self.js)

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
