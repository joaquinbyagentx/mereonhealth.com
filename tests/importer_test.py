#!/usr/bin/env python3
import importlib.util
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
                IMPORTER.fetch("https://protidehealth.com/product/bpc-157/")

    def test_off_domain_product_page_fails_closed(self):
        with patch.object(IMPORTER, "parse_page") as parse_page:
            with self.assertRaisesRegex(RuntimeError, "unexpected public source URL"):
                IMPORTER.coa_metadata(
                    "https://attacker.example/product/bpc-157/",
                    r"/certificates/bpc-157-10mg-coa-\d+/?$",
                    "2026-08-02T00:00:00Z",
                )
            parse_page.assert_not_called()

    def test_off_domain_certificate_link_fails_closed(self):
        product_page = IMPORTER.PageParser()
        product_page.links = [
            "https://attacker.example/certificates/bpc-157-10mg-coa-123/"
        ]
        certificate_page = IMPORTER.PageParser()
        certificate_page.text = [
            "COA by Fake Lab Lot FAKE-1 COA 123 Test Method HPLC-MS Identity"
        ]
        certificate_page.title = ["Fake COA"]

        with patch.object(
            IMPORTER,
            "parse_page",
            side_effect=[product_page, certificate_page],
        ):
            with self.assertRaisesRegex(RuntimeError, "unexpected public source URL"):
                IMPORTER.coa_metadata(
                    "https://protidehealth.com/product/bpc-157/",
                    r"/certificates/bpc-157-10mg-coa-\d+/?$",
                    "2026-08-02T00:00:00Z",
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
