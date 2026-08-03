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
        payload = b'{"base":"USD","date":"2026-08-03","rates":{"MXN":17.3207}}'
        with patch.object(IMPORTER, "fetch", return_value=payload):
            self.assertEqual(IMPORTER.fetch_exchange_rate(), 173207)

    def test_exchange_rate_change_fails_closed(self):
        payload = b'{"base":"USD","date":"2026-08-03","rates":{"MXN":17.3208}}'
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
        unrelated = [{"slug": f"unrelated-{index}"} for index in range(12)]
        with patch.object(IMPORTER, "fetch_exchange_rate", return_value=173207), patch.object(
            IMPORTER, "fetch", return_value=json.dumps(unrelated).encode()
        ):
            with self.assertRaisesRegex(RuntimeError, "reviewed product is missing"):
                IMPORTER.build_catalog()


if __name__ == "__main__":
    unittest.main(verbosity=2)
