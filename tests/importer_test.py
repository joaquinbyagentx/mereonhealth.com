#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "import_catalog", ROOT / "scripts" / "import_catalog.py"
)
assert SPEC is not None
IMPORTER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(IMPORTER)


class ImporterSecurityTests(unittest.TestCase):
    def test_order_costs_recompute_exact_approved_prices_without_adding_iva(self):
        expected = {
            "T-10": 135000,
            "BPC-157-10": 135000,
            "KLOW-80": 345000,
            "CJCIPA-5-5": 190000,
            "TA1-10": 195000,
            "IPAMORELIN-5": 120000,
            "TESA-5": 135000,
            "GHKCU-100-10ML": 205000,
        }
        self.assertEqual(IMPORTER.FX_MXN_TEN_THOUSANDTHS_PER_USD, 173288)
        for code, clean_price in expected.items():
            line = IMPORTER.SUPPLIER_ORDER["lines"][code]
            numerator = (
                line["unitUsdCents"]
                * 173288
                * 11300
                * 14000
            )
            denominator = 10000 * 10000 * 10000 * 5000
            independently_computed = IMPORTER.round_div(numerator, denominator) * 5000
            computed = IMPORTER.base_price_centavos(line["unitUsdCents"])
            self.assertEqual(computed, independently_computed, code)
            self.assertEqual(computed, clean_price, code)
            self.assertEqual(computed % IMPORTER.CLEAN_INCREMENT_CENTAVOS, 0, code)

    def test_importer_research_copy_matches_canonical_catalog_exactly(self):
        catalog = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8"))
        expected = [
            {
                "code": product["code"],
                "researchArea": product["researchArea"],
                "researchDescription": product["researchDescription"],
            }
            for product in catalog["products"]
        ]
        actual = [
            {
                "code": selection["code"],
                "researchArea": selection["researchArea"],
                "researchDescription": selection["researchDescription"],
            }
            for selection in IMPORTER.SELECTIONS
        ]

        self.assertEqual(len(actual), 14)
        self.assertEqual(actual, expected)
        for product in catalog["products"]:
            self.assertEqual(
                product["purchaseEnabled"],
                product["code"] in IMPORTER.SUPPLIER_ORDER["lines"],
                product["code"],
            )

    def test_cross_origin_redirect_fails_before_body_is_read(self):
        class RedirectedResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def geturl(self):
                return "https://attacker.example/certificates/fake/"

            def read(self):
                raise AssertionError("off-domain response body must not be read")

        with patch.object(IMPORTER.urllib.request, "urlopen", return_value=RedirectedResponse()):
            with self.assertRaisesRegex(RuntimeError, "unexpected public source URL"):
                IMPORTER.fetch("https://ascensionpeptides.com/product/bpc-157-10mg/")

    def test_off_domain_product_page_fails_closed(self):
        with patch.object(IMPORTER, "parse_page") as parse_page:
            with self.assertRaisesRegex(RuntimeError, "unexpected public source URL"):
                IMPORTER.coa_metadata(
                    "https://attacker.example/product/bpc-157/",
                    None,
                    "2026-08-02T00:00:00Z",
                )
            parse_page.assert_not_called()

    def test_off_domain_certificate_link_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, "unexpected public source URL"):
            IMPORTER.require_public_source_url(
                "https://attacker.example/wp-content/uploads/fake.pdf",
                "/wp-content/uploads/",
            )

    def test_unreviewed_new_coa_fails_closed(self):
        product_page = IMPORTER.PageParser()
        product_page.links = [
            "https://ascensionpeptides.com/wp-content/uploads/2026/08/new-coa.pdf"
        ]
        with patch.object(IMPORTER, "parse_page", return_value=product_page):
            with self.assertRaisesRegex(RuntimeError, "now published"):
                IMPORTER.coa_metadata(
                    "https://ascensionpeptides.com/product/bpc-157-10mg/",
                    None,
                    "2026-08-03T00:00:00Z",
                )

    def test_exchange_rate_is_fetched_and_validated_exactly(self):
        payload = b'<html><body>Tipo de Cambio y Tasas al 03/08/2026 <span>DOLAR</span> 17.3288</body></html>'
        with patch.object(IMPORTER, "fetch", return_value=payload):
            self.assertEqual(IMPORTER.fetch_exchange_rate(), 173288)

    def test_exchange_rate_change_fails_closed(self):
        payload = b'<html><body>Tipo de Cambio y Tasas al 03/08/2026 <span>DOLAR</span> 17.3289</body></html>'
        with patch.object(IMPORTER, "fetch", return_value=payload):
            with self.assertRaisesRegex(RuntimeError, "rate changed"):
                IMPORTER.fetch_exchange_rate()

    def test_coa_metadata_accepts_only_the_pinned_reviewed_pdf(self):
        coa_url = "https://ascensionpeptides.com/wp-content/uploads/2026/01/coa.pdf"
        document = b"%PDF-1.7\nreviewed document"
        page = f'<a href="{coa_url}">Download COA</a>'.encode()

        with patch.object(
            IMPORTER,
            "fetch",
            side_effect=lambda url: page if "/product/" in url else document,
        ):
            metadata = IMPORTER.coa_metadata(
                "https://ascensionpeptides.com/product/example/",
                {
                    "url": coa_url,
                    "sha256": hashlib.sha256(document).hexdigest(),
                    "lot": "LOT-1",
                    "lab": "Lab",
                    "methods": ["HPLC"],
                },
                "2026-08-03T00:00:00Z",
            )

        self.assertEqual(metadata["sourceSha256"], hashlib.sha256(document).hexdigest())
        self.assertEqual(metadata["lot"], "LOT-1")

    def test_coa_metadata_rejects_changed_reviewed_pdf(self):
        coa_url = "https://ascensionpeptides.com/wp-content/uploads/2026/01/coa.pdf"
        page = f'<a href="{coa_url}">Download COA</a>'.encode()
        with patch.object(
            IMPORTER,
            "fetch",
            side_effect=lambda url: page if "/product/" in url else b"%PDF-1.7\ntampered",
        ):
            with self.assertRaisesRegex(RuntimeError, "reviewed COA content changed"):
                IMPORTER.coa_metadata(
                    "https://ascensionpeptides.com/product/example/",
                    {"url": coa_url, "sha256": "0" * 64, "lot": "LOT-1", "lab": "Lab", "methods": ["HPLC"]},
                    "2026-08-03T00:00:00Z",
                )

    def test_catalog_build_rejects_missing_reviewed_product(self):
        unrelated = [{"slug": f"unrelated-{index}"} for index in range(14)]
        with patch.object(IMPORTER, "fetch_exchange_rate", return_value=173288), patch.object(
            IMPORTER, "fetch", return_value=json.dumps(unrelated).encode()
        ):
            with self.assertRaisesRegex(RuntimeError, "reviewed product is missing"):
                IMPORTER.build_catalog()


if __name__ == "__main__":
    unittest.main(verbosity=2)
