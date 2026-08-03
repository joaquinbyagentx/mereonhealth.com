#!/usr/bin/env python3
"""Import Mereon's catalog from Ascension Peptides' public storefront.

This script uses only public, unauthenticated pages. Supplier data is a research
input, not evidence of reseller affiliation. Descriptions are original and any
source-shape change in a listed product fails visibly.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

SOURCE_ORIGIN = "ascensionpeptides.com"
SHOP_URL = "https://ascensionpeptides.com/shop/"
API_URL = "https://ascensionpeptides.com/wp-json/wc/store/v1/products?per_page=100"
FX_SOURCE_URL = "https://api.frankfurter.app/latest?from=USD&to=MXN"
FX_SOURCE_REDIRECT_URL = "https://api.frankfurter.dev/v1/latest?from=USD&to=MXN"
FX_SOURCE_DATE = "2026-08-03"
USER_AGENT = "MereonCatalogImporter/2.0 (+https://mereonhealth.com)"
OUTPUT_PATH = Path("data/catalog.json")

FX_MXN_TEN_THOUSANDTHS_PER_USD = 173_207
LANDED_UPLIFT_BPS = 1300
TARGET_PROFIT_MARKUP_BPS = 4000
IVA_BPS = 1600
CLEAN_INCREMENT_CENTAVOS = 5000
ACCEPTED_EFFECTIVE_MARKUP_BPS = [3700, 4300]

SELECTIONS = [
    {
        "code": "BPC-157-10",
        "name": "BPC-157",
        "slug": "bpc-157-10mg",
        "sourceTitle": "BPC-157 (10mg)",
        "presentation": "10 mg",
        "coa": None,
        "researchArea": "Reparación de tejidos",
        "researchDescription": "Investigado en modelos preclínicos para entender cómo responden los tejidos después de un daño y cómo se organizan durante su reparación, con especial interés en tejidos digestivos, musculares y conectivos.",
    },
    {
        "code": "TB500-5",
        "name": "TB-500",
        "slug": "tb-500-5mg",
        "sourceTitle": "TB-500 (5MG)",
        "presentation": "5 mg",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/03/COA_Thymosin_beta4_quant_31-01260229_20260214.pdf",
            "sha256": "92cdd2245957fb01cd54c4abd6827dab6db3d7e8ac1c99bb1dcddf53351232f2",
            "lot": "31-01260229", "lab": "MZ Biolabs", "methods": ["HPLC", "LC-MS"],
        },
        "researchArea": "Movimiento celular y reparación de tejidos",
        "researchDescription": "Péptido relacionado con thymosin beta-4, investigado en modelos preclínicos para entender cómo se desplazan y organizan las células durante la respuesta de músculos, tendones y otros tejidos ante un daño.",
    },
    {
        "code": "MOTSC-10",
        "name": "MOTS-C",
        "slug": "mots-c-10mg",
        "sourceTitle": "MOTS-C (10MG)",
        "presentation": "10 mg",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/03/COA_MOTS-C_quant_24-01260229_20260305.pdf",
            "sha256": "ace1d6f18d530a19c807f1aed83487ec3a52196a0e7b37dd4c2d828831b9a9f1",
            "lot": "24-01260229", "lab": "MZ Biolabs", "methods": ["HPLC", "LC-MS"],
        },
        "researchArea": "Energía celular y metabolismo",
        "researchDescription": "Péptido derivado de una secuencia mitocondrial, investigado para entender cómo las células utilizan la energía y responden ante cambios metabólicos y situaciones de estrés celular.",
    },
    {
        "code": "GHKCU-100-3ML",
        "name": "GHK-Cu",
        "slug": "ghk-cu-100mg-3ml",
        "sourceTitle": "GHK-CU (100MG) 3mL",
        "presentation": "100 mg · 3 mL",
        "coa": None,
        "researchArea": "Piel, colágeno y tejido conectivo",
        "researchDescription": "Tripéptido capaz de unirse al cobre, investigado para entender su participación en la formación de colágeno y en la respuesta de la piel y otros tejidos conectivos durante procesos de renovación y reparación.",
    },
    {
        "code": "CJCIPA-5-5",
        "name": "CJC-1295 No-DAC + Ipamorelin",
        "slug": "fit-stack-cjc-1295-ipamorelin",
        "sourceTitle": "CJC-1295 No DAC 5mg + Ipamorelin 5mg (FIT Stack 10mg)",
        "presentation": "CJC-1295 No DAC 5 mg + Ipamorelin 5 mg · 10 mg total",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/05/CJC-1295_No_DAC_Ipamorelin_06-05260628_COA.pdf",
            "sha256": "83fea5f4667f68af48c882197ef11786f1f0499618e4dd44f2946cab57e5d209",
            "lot": "06-05260628", "lab": "Kovera Labs", "methods": ["RP-HPLC", "LC-MS", "endotoxinas", "esterilidad", "metales pesados"],
        },
        "researchArea": "Señales hormonales y metabolismo",
        "researchDescription": "Mezcla de dos péptidos investigada para entender las señales que regulan la liberación de hormona de crecimiento y su relación con el metabolismo, el uso de energía y el mantenimiento de los tejidos.",
    },
    {
        "code": "TA1-10",
        "name": "Thymosin Alpha 1",
        "slug": "thymosin-alpha-1-10mg",
        "sourceTitle": "Thymosin Alpha 1 (10MG)",
        "presentation": "10 mg",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/05/Thymosin_alpha-1_33-05260628_COA.pdf",
            "sha256": "9b1b2ffb3c9dad063ab7534c4dde4220219e003f9234834e0b85b0e8b3fa312e",
            "lot": "33-05260628", "lab": "Kovera Labs", "methods": ["RP-HPLC", "LC-MS", "endotoxinas", "esterilidad", "metales pesados"],
        },
        "researchArea": "Respuesta inmunológica",
        "researchDescription": "Investigado para entender cómo se comunican y coordinan las células del sistema inmunológico ante distintas señales y condiciones experimentales.",
    },
    {
        "code": "TESA-5",
        "name": "Tesamorelin",
        "slug": "tesamorelin-5mg",
        "sourceTitle": "Tesamorelin (5MG)",
        "presentation": "5 mg",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/02/COA_Tesamorelin_quant_32-01260229_20260212.pdf",
            "sha256": "de121018334ead3efaba870acf1814f235c12ed32fd578a782f77f349a2985a4",
            "lot": "32-01260229", "lab": "MZ Biolabs", "methods": ["HPLC", "LC-MS"],
        },
        "researchArea": "Regulación hormonal",
        "researchDescription": "Análogo peptídico investigado para entender cómo se regula la liberación de hormona de crecimiento y cómo estas señales se relacionan con diferentes procesos metabólicos.",
    },
    {
        "code": "EPITHALON-10",
        "name": "Epithalon",
        "slug": "epithalon-10mg",
        "sourceTitle": "Epithalon (10mg)",
        "presentation": "10 mg",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/05/Epithalon_15-05260628_COA.pdf",
            "sha256": "cf40aad2b791b54b63223d9955350696530fd82cf9c404bef8c7148548931f2c",
            "lot": "15-05260628", "lab": "Kovera Labs", "methods": ["RP-HPLC", "LC-MS", "endotoxinas", "esterilidad", "metales pesados"],
        },
        "researchArea": "Envejecimiento celular y telómeros",
        "researchDescription": "Tetrapéptido investigado en modelos preclínicos para entender los cambios que ocurren en las células con el paso del tiempo y el papel de los telómeros en el mantenimiento celular.",
    },
    {
        "code": "KPV-10",
        "name": "KPV",
        "slug": "kpv-10mg",
        "sourceTitle": "KPV (10MG)",
        "presentation": "10 mg",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/05/KPV_20-05260628_COA.pdf",
            "sha256": "ee84f58b6204e85449ba57fe40f131f5bcfd986536638a3f7210d8f78863fe7d",
            "lot": "20-05260628", "lab": "Kovera Labs", "methods": ["RP-HPLC", "LC-MS", "endotoxinas", "esterilidad", "metales pesados"],
        },
        "researchArea": "Respuesta inflamatoria",
        "researchDescription": "Tripéptido investigado para entender cómo responden las células ante señales inflamatorias, especialmente en modelos relacionados con la piel y los tejidos del sistema digestivo.",
    },
    {
        "code": "GLOW-70",
        "name": "GLOW",
        "slug": "glow-advanced-peptide-blend-for-radiance-recovery",
        "sourceTitle": "GHK-CU 50mg + BPC-157 10mg + TB-500 10mg (GLOW 70mg)",
        "presentation": "GHK-Cu 50 mg + BPC-157 10 mg + TB-500 10 mg · 70 mg total",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/06/Glow_07-05260628_COA-combined.pdf",
            "sha256": "7a9ed6b6444ca1b8ab0f48bb29aeacbac60ae96b58265d1c208ac6376c573d21",
            "lot": "07-05260628", "lab": "Kovera Labs", "methods": ["RP-HPLC", "LC-MS", "endotoxinas", "esterilidad", "metales pesados"],
        },
        "researchArea": "Piel, colágeno y reparación de tejidos",
        "researchDescription": "Combina GHK-Cu, BPC-157 y TB-500, péptidos investigados en modelos preclínicos para entender la formación de colágeno, la organización celular y la respuesta de la piel y otros tejidos durante su reparación.",
    },
    {
        "code": "KLOW-80",
        "name": "KLOW",
        "slug": "klow-ghk-cu-bpc-157-thymosin-beta4-kpv",
        "sourceTitle": "GHK-Cu 50mg + BPC-157 10mg + TB-500 10mg + KPV 10mg (KLOW 80mg)",
        "presentation": "GHK-Cu 50 mg + BPC-157 10 mg + TB-500 10 mg + KPV 10 mg · 80 mg total",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/02/COA_KLOW_TB4_quant_46-01260229_20260212.pdf",
            "sha256": "c531a1bf872704c931579eaadf491db5bbabd2fda1ff83a5e93feee4315e6447",
            "lot": "46-01260229", "lab": "MZ Biolabs", "methods": ["HPLC", "LC-MS"],
        },
        "researchArea": "Reparación de tejidos y respuesta inflamatoria",
        "researchDescription": "Combina GHK-Cu, BPC-157, TB-500 y KPV. Se investiga en modelos preclínicos para entender cómo se organizan los tejidos durante su reparación y cómo responden las células ante señales inflamatorias.",
    },
    {
        "code": "WOLVERINE-10-10",
        "name": "Wolverine Stack",
        "slug": "wolverine-stack",
        "sourceTitle": "BPC-157 10mg + TB-500 10mg (Wolverine Stack 20mg)",
        "presentation": "BPC-157 10 mg + TB-500 10 mg · 20 mg total",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/06/BPC-157_TB-500_08-05260628_COA-combined.pdf",
            "sha256": "a18c0610b972b5a3ea2172c54b8f2a7f5d0c9a1eea98fea3fdfc6891f31b77e7",
            "lot": "08-05260628", "lab": "Kovera Labs", "methods": ["RP-HPLC", "LC-MS", "endotoxinas", "esterilidad", "metales pesados"],
        },
        "researchArea": "Músculos, tendones y tejido conectivo",
        "researchDescription": "Combina BPC-157 y TB-500, dos péptidos investigados en modelos preclínicos para entender la respuesta de músculos, tendones y tejido conectivo después de una lesión, daño o esfuerzo.",
    },
]


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: List[str] = []
        self.text: List[str] = []
        self.in_title = False
        self.title: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Any]) -> None:
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(html.unescape(href))
        if tag == "title":
            self.in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        clean = " ".join(data.split())
        if clean:
            self.text.append(clean)
            if self.in_title and not self.title:
                self.title.append(clean)


def require_source_origin(url: str) -> None:
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != SOURCE_ORIGIN
        or parsed.port is not None
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise RuntimeError(f"unexpected public source URL: {url}")


def require_fetch_url(url: str) -> None:
    if url in {FX_SOURCE_URL, FX_SOURCE_REDIRECT_URL}:
        return
    require_source_origin(url)


def fetch(url: str) -> bytes:
    require_fetch_url(url)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError(f"HTTP {response.status} for {url}")
            require_fetch_url(response.geturl())
            return response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"Unable to fetch public source {url}: {exc}") from exc


def parse_page(url: str) -> PageParser:
    parser = PageParser()
    parser.feed(fetch(url).decode("utf-8", "replace"))
    return parser


def require_public_source_url(url: str, path_prefix: str) -> None:
    require_source_origin(url)
    parsed = urlparse(url)
    if (
        not parsed.path.startswith(path_prefix)
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError(f"unexpected public source URL: {url}")


def round_div(numerator: int, denominator: int) -> int:
    if numerator < 0 or denominator <= 0:
        raise ValueError("round_div accepts a non-negative numerator and positive denominator")
    return (numerator + denominator // 2) // denominator


def base_price_centavos(
    source_usd_cents: int,
    fx_mxn_ten_thousandths_per_usd: int = FX_MXN_TEN_THOUSANDTHS_PER_USD,
) -> int:
    numerator = (
        source_usd_cents
        * fx_mxn_ten_thousandths_per_usd
        * (10_000 + LANDED_UPLIFT_BPS)
        * (10_000 + TARGET_PROFIT_MARKUP_BPS)
    )
    denominator = 10_000 * 10_000 * 10_000
    clean_units = round_div(numerator, denominator * CLEAN_INCREMENT_CENTAVOS)
    return clean_units * CLEAN_INCREMENT_CENTAVOS


def profit_markup_bps(
    source_usd_cents: int,
    price_centavos: int,
    fx_mxn_ten_thousandths_per_usd: int = FX_MXN_TEN_THOUSANDTHS_PER_USD,
) -> int:
    landed_numerator = source_usd_cents * fx_mxn_ten_thousandths_per_usd * (10_000 + LANDED_UPLIFT_BPS)
    landed_denominator = 10_000 * 10_000
    profit_numerator = price_centavos * landed_denominator - landed_numerator
    return round_div(profit_numerator * 10_000, landed_numerator)


def plain_source(product: Dict[str, Any]) -> str:
    parser = PageParser()
    parser.feed(" ".join([product.get("name", ""), product.get("short_description", ""), product.get("description", "")]))
    return " ".join(parser.text)


def fetch_exchange_rate() -> int:
    payload = json.loads(fetch(FX_SOURCE_URL).decode("utf-8"))
    if payload.get("base") != "USD" or payload.get("date") != FX_SOURCE_DATE:
        raise RuntimeError("Frankfurter response does not match the reviewed USD/date")
    try:
        rate = Decimal(str(payload["rates"]["MXN"]))
    except (KeyError, InvalidOperation, TypeError) as error:
        raise RuntimeError("Frankfurter response lacks a valid MXN rate") from error
    scaled = rate * 10_000
    if scaled != scaled.to_integral_value() or int(scaled) != FX_MXN_TEN_THOUSANDTHS_PER_USD:
        raise RuntimeError("Frankfurter USD/MXN rate changed from the reviewed 17.3207")
    return int(scaled)


def choose_product(products: List[Dict[str, Any]], selection: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    matches = [product for product in products if product.get("slug") == selection["slug"]]
    if not matches:
        return None
    if len(matches) != 1:
        raise RuntimeError(f"Expected one product for {selection['slug']}; found {len(matches)}")
    return matches[0]


def coa_metadata(
    product_url: str,
    expected: Optional[Dict[str, Any]],
    verified_at: str,
) -> Optional[Dict[str, Any]]:
    require_public_source_url(product_url, "/product/")
    product_page = parse_page(product_url)
    matches = list(dict.fromkeys(link for link in product_page.links if (
        link.startswith(f"https://{SOURCE_ORIGIN}/wp-content/uploads/")
        and urlparse(link).path.lower().endswith(".pdf")
    )))
    if expected is None:
        if matches:
            raise RuntimeError(f"{product_url}: a COA is now published and requires reviewed metadata")
        return None
    coa_url = expected["url"]
    if coa_url not in matches:
        raise RuntimeError(f"{product_url}: reviewed COA URL is no longer linked")
    require_public_source_url(coa_url, "/wp-content/uploads/")
    document = fetch(coa_url)
    if not document.startswith(b"%PDF-"):
        raise RuntimeError(f"{coa_url}: linked COA is not a readable PDF response")
    expected_sha256 = expected.get("sha256", "")
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise RuntimeError(f"{coa_url}: reviewed COA has no valid SHA-256 pin")
    actual_sha256 = hashlib.sha256(document).hexdigest()
    if actual_sha256 != expected_sha256:
        raise RuntimeError(
            f"{coa_url}: reviewed COA content changed "
            f"(expected SHA-256 {expected_sha256}, got {actual_sha256})"
        )
    return {
        "url": coa_url,
        "sourceSha256": actual_sha256,
        "kind": "source-reference",
        "label": "COA de referencia publicado por Ascension Peptides",
        "lot": expected["lot"],
        "lab": expected["lab"],
        "methods": expected["methods"],
        "sourceDocumentTitle": f"Certificate of Analysis — lote {expected['lot']}",
        "verifiedAt": verified_at,
    }


def build_catalog() -> Dict[str, Any]:
    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    fx_mxn_ten_thousandths_per_usd = fetch_exchange_rate()
    raw = json.loads(fetch(API_URL).decode("utf-8"))
    if not isinstance(raw, list) or len(raw) < 12:
        raise RuntimeError(f"Store API returned an unexpected product list ({type(raw).__name__}, count={len(raw) if isinstance(raw, list) else 'n/a'})")

    normalized = []
    for selection in SELECTIONS:
        product = choose_product(raw, selection)
        if product is None:
            raise RuntimeError(
                f"{selection['slug']}: reviewed product is missing from the public catalog"
            )

        source_title = html.unescape(product.get("name", ""))
        if source_title != selection["sourceTitle"]:
            raise RuntimeError(
                f"{selection['slug']}: source title changed from {selection['sourceTitle']!r} to {source_title!r}"
            )
        if product.get("is_in_stock") is not True:
            raise RuntimeError(f"{selection['slug']}: product is not currently in stock")
        prices = product.get("prices", {})
        if prices.get("currency_code") != "USD" or prices.get("currency_minor_unit") != 2:
            raise RuntimeError(f"{selection['slug']}: expected USD with 2 minor units")
        if not str(prices.get("price", "")).isdigit() or int(prices["price"]) <= 0:
            raise RuntimeError(f"{selection['slug']}: missing or invalid public USD price")
        source_usd_cents = int(prices["price"])
        price_centavos = base_price_centavos(
            source_usd_cents, fx_mxn_ten_thousandths_per_usd
        )
        profit_markup = profit_markup_bps(
            source_usd_cents, price_centavos, fx_mxn_ten_thousandths_per_usd
        )
        if not ACCEPTED_EFFECTIVE_MARKUP_BPS[0] <= profit_markup <= ACCEPTED_EFFECTIVE_MARKUP_BPS[1]:
            raise RuntimeError(f"{selection['slug']}: rounded effective markup {profit_markup / 100:.2f}% is outside guardrails")
        product_url = product.get("permalink")
        if not product_url or not product_url.startswith(f"https://{SOURCE_ORIGIN}/product/"):
            raise RuntimeError(f"{selection['slug']}: missing or unexpected product URL")
        coa = coa_metadata(product_url, selection["coa"], fetched_at)
        status = "available" if coa else "coa_pending"
        images = product.get("images") or []
        if not images:
            raise RuntimeError(f"{selection['slug']}: missing matching public product image")
        source_image = images[0]
        source_image_url = source_image.get("src", "")
        if not source_image_url.startswith(f"https://{SOURCE_ORIGIN}/wp-content/uploads/"):
            raise RuntimeError(f"{selection['slug']}: unexpected product image URL")
        image_filename = f"{selection['code'].lower()}.png"
        record = {
            "code": selection["code"],
            "name": selection["name"],
            "presentation": selection["presentation"],
            "status": status,
            "researchArea": selection["researchArea"],
            "researchDescription": selection["researchDescription"],
            "brandSupplier": {
                "brand": "Ascension Peptides",
                "role": "Marca / proveedor de referencia",
                "notice": "La identificación de marca o proveedor no implica afiliación, autorización o distribución oficial.",
            },
            "source": {
                "catalogUrl": SHOP_URL,
                "apiUrl": API_URL,
                "productUrl": product_url,
                "priceEvidenceUrl": product_url,
                "sourceTitle": source_title,
                "sourcePresentation": source_title,
                "fetchedAt": fetched_at,
            },
            "sourceUsdCents": source_usd_cents,
            "basePriceCentavos": price_centavos,
            "profitMarkupBasisPoints": profit_markup,
            "image": {
                "assetPath": f"assets/images/products/{image_filename}",
                "sourceUrl": source_image_url,
                "alt": f"Fotografía de referencia Ascension Peptides de {selection['name']} {selection['presentation']}",
                "notice": "Imagen pública de referencia del catálogo fuente; no implica afiliación o autorización.",
            },
            "coa": coa or {
                "url": None,
                "kind": "pending",
                "label": "COA pendiente de publicación por Ascension Peptides para esta referencia.",
                "lot": None,
                "lab": None,
                "methods": [],
                "sourceDocumentTitle": None,
                "verifiedAt": fetched_at,
            },
        }
        normalized.append(record)

    return {
        "schemaVersion": 2,
        "generatedAt": fetched_at,
        "sourceNotice": "Ascension Peptides public catalog data is a research input. No reseller, affiliate, authorization, or official-distributor relationship is implied.",
        "pricingAssumptions": {
            "fxMxnTenThousandthsPerUsd": fx_mxn_ten_thousandths_per_usd,
            "fxSourceUrl": FX_SOURCE_URL,
            "fxSourceDate": FX_SOURCE_DATE,
            "landedUpliftBasisPoints": LANDED_UPLIFT_BPS,
            "targetProfitMarkupBasisPoints": TARGET_PROFIT_MARKUP_BPS,
            "ivaIncludedBasisPoints": IVA_BPS,
            "acceptedEffectiveMarkupRangeBasisPoints": ACCEPTED_EFFECTIVE_MARKUP_BPS,
            "cleanPriceIncrementCentavos": CLEAN_INCREMENT_CENTAVOS,
            "rule": "Supplier USD price × 17.3207 MXN/USD × 1.13 landed uplift × 1.40 markup; nearest MXN 50, exact midpoint upward. No separate IVA multiplier is added; checkout transparently extracts included IVA from the displayed final amount.",
        },
        "products": normalized,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--check", action="store_true", help="Validate current public data without writing")
    args = parser.parse_args()
    try:
        catalog = build_catalog()
        available = sum(product["status"] == "available" for product in catalog["products"])
        pending = sum(product["status"] == "coa_pending" for product in catalog["products"])
        evaluation = sum(product["status"] == "evaluation" for product in catalog["products"])
        if not args.check:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Catalog validated: 12 products; available={available}; coa_pending={pending}; evaluation={evaluation}")
        print(f"Source: {API_URL}")
        print("Output: check-only" if args.check else f"Output: {args.output}")
        return 0
    except Exception as exc:
        print(f"ERROR: catalog import failed closed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
