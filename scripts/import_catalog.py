#!/usr/bin/env python3
"""Import Mereon's launch catalog from Protide Health's public storefront.

This script uses only public, unauthenticated pages. Protide is a research input,
not a reseller affiliation. Product imagery and supplier-facing claims are not
copied. Any source-shape change in a listed product fails visibly.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

API_URL = "https://protidehealth.com/wp-json/wc/store/v1/products?per_page=100"
USER_AGENT = "MereonCatalogImporter/1.0 (+https://mereonhealth.com)"
OUTPUT_PATH = Path("data/catalog.json")

FX_MXN_CENTAVOS_PER_USD = 1750
LANDED_UPLIFT_BPS = 1300
TARGET_MARGIN_BPS = 4500
CLEAN_INCREMENT_CENTAVOS = 5000

SELECTIONS = [
    {
        "code": "BPC-157-10",
        "name": "BPC-157",
        "slug": "bpc-157",
        "variant": "10mg",
        "presentation": "10 mg · vial liofilizado",
        "coa": r"/certificates/bpc-157-10mg-coa-\d+/?$",
        "research": "Péptido sintético de 15 aminoácidos estudiado en modelos preclínicos de señalización y respuesta tisular; la evidencia no establece beneficios clínicos.",
    },
    {
        "code": "TB500-10",
        "name": "TB-500",
        "slug": "tb-500-10mg",
        "variant": None,
        "presentation": "10 mg · vial liofilizado",
        "source_terms": ["10mg"],
        "coa": r"/certificates/tb-500-10mg-coa-\d+/?$",
        "research": "Péptido sintético relacionado con thymosin beta-4, investigado en sistemas preclínicos de dinámica celular; sin indicaciones terapéuticas aprobadas.",
    },
    {
        "code": "MOTSC-10",
        "name": "MOTS-c",
        "slug": "mots-c-peptide",
        "variant": "10mg",
        "presentation": "10 mg · vial liofilizado",
        "coa": r"/certificates/mots-c-10mg-coa-\d+/?$",
        "research": "Péptido derivado de una secuencia mitocondrial investigado en modelos preclínicos de señalización metabólica; sin extrapolación a resultados en personas.",
    },
    {
        "code": "GHKCU-50",
        "name": "GHK-Cu",
        "slug": "ghk-cu-copper-peptide",
        "variant": "50mg",
        "presentation": "50 mg · vial liofilizado",
        "coa": r"/certificates/ghk-cu-50mg-coa-\d+/?$",
        "research": "Complejo tripeptídico de cobre utilizado como referencia en investigación bioquímica; no se presenta como medicamento, cosmético ni tratamiento.",
    },
    {
        "code": "CJCIPA-5-5",
        "name": "CJC-1295 No-DAC + Ipamorelin",
        "slug": "cjc-1295-no-dac-ipamorelin-blend",
        "variant": "5/5mg",
        "presentation": "5/5 mg · vial liofilizado",
        "coa": r"/certificates/cjc-1295-no-dac-ipamorelin-5-5mg-coa-\d+/?$",
        "research": "Mezcla de dos péptidos estudiada como material analítico en modelos de señalización; no implica eficacia, seguridad o uso clínico.",
    },
    {
        "code": "TA1-10",
        "name": "Thymosin Alpha-1",
        "slug": "thymosin-alpha-1-10mg",
        "variant": None,
        "presentation": "10 mg · vial liofilizado",
        "source_terms": ["10mg"],
        "coa": r"/certificates/thymosin-alpha-1-10mg-coa-\d+/?$",
        "research": "Péptido sintético empleado en investigación de vías inmunológicas in vitro y preclínicas; esta descripción no constituye una indicación terapéutica.",
    },
    {
        "code": "TESA-10",
        "name": "Tesamorelin",
        "slug": "tesamorelin",
        "variant": "10mg",
        "presentation": "10 mg · vial liofilizado",
        "coa": r"/certificates/tesamorelin-10mg-coa-\d+/?$",
        "research": "Análogo peptídico sintético estudiado en investigación de señalización endocrina; el material se ofrece exclusivamente para investigación y referencia.",
    },
    {
        "code": "EPITALON-10",
        "name": "Epitalon",
        "slug": "epithalon-10mg",
        "variant": None,
        "presentation": "10 mg · vial liofilizado",
        "source_terms": ["Epithalon", "10mg"],
        "coa": r"/certificates/epithalon-10mg-coa-\d+/?$",
        "research": "Tetrapéptido sintético investigado en modelos preclínicos de biología celular; no hay promesa de resultados ni recomendación de uso.",
    },
    {
        "code": "KPV-10",
        "name": "KPV",
        "slug": "kpv-10mg",
        "variant": None,
        "presentation": "10 mg · vial liofilizado",
        "source_terms": ["KPV", "10mg"],
        "coa": r"/certificates/kpv-10mg-coa-\d+/?$",
        "research": "Tripéptido sintético utilizado en estudios preclínicos de señalización; sus contextos de investigación no demuestran resultados clínicos.",
    },
    {
        "code": "GLOW-70",
        "name": "Glow blend",
        "slug": "glow-peptide-blend-ghk-cu-tb-500-bpc-157",
        "variant": "50/10/10mg",
        "presentation": "GHK-Cu 50 mg + BPC-157 10 mg + TB-500 10 mg · vial liofilizado",
        "coa": r"/certificates/(?:glow-blend-70mg|glow-70mg)-coa-\d+/?$",
        "research": "Mezcla analítica de GHK-Cu, BPC-157 y TB-500 para investigación controlada; el nombre comercial no describe un resultado esperado.",
    },
    {
        "code": "KLOW-80",
        "name": "Klow blend",
        "slug": "klow-blend-50mg-10-10-10-ghk-cu-kpv-bpc-157-tb-500",
        "variant": None,
        "presentation": "GHK-Cu 50 mg + KPV 10 mg + BPC-157 10 mg + TB-500 10 mg · vial liofilizado",
        "source_terms": ["GHK-Cu (50mg)", "KPV (10mg)", "BPC-157 (10mg)", "TB-500 (10mg)"],
        "coa": r"/certificates/klow-blend-coa-\d+/?$",
        "research": "Mezcla analítica de cuatro péptidos para comparación y caracterización en laboratorio; no es un protocolo ni una promesa de efecto.",
    },
    {
        "code": "WOLVERINE-10-10",
        "name": "Wolverine blend",
        "slug": "bpc-157-tb-500-peptide-blend",
        "variant": "10/10mg",
        "presentation": "BPC-157 10 mg + TB-500 10 mg · vial liofilizado",
        "coa": r"/certificates/bpc-157-tb-500-10-10mg-coa-\d+/?$",
        "research": "Mezcla analítica de BPC-157 y TB-500 para investigación preclínica controlada; el nombre comercial no afirma recuperación ni otro resultado.",
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
        or parsed.hostname != "protidehealth.com"
        or parsed.port is not None
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise RuntimeError(f"unexpected public source URL: {url}")


def fetch(url: str) -> bytes:
    require_source_origin(url)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError(f"HTTP {response.status} for {url}")
            require_source_origin(response.geturl())
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


def base_price_centavos(source_usd_cents: int) -> int:
    numerator = source_usd_cents * FX_MXN_CENTAVOS_PER_USD * (10_000 + LANDED_UPLIFT_BPS)
    denominator = 100 * (10_000 - TARGET_MARGIN_BPS)
    clean_units = round_div(numerator, denominator * CLEAN_INCREMENT_CENTAVOS)
    return clean_units * CLEAN_INCREMENT_CENTAVOS


def margin_bps(source_usd_cents: int, price_centavos: int) -> int:
    landed_numerator = source_usd_cents * FX_MXN_CENTAVOS_PER_USD * (10_000 + LANDED_UPLIFT_BPS)
    landed_denominator = 100 * 10_000
    gross_numerator = price_centavos * landed_denominator - landed_numerator
    return round_div(gross_numerator * 10_000, price_centavos * landed_denominator)


def plain_source(product: Dict[str, Any]) -> str:
    parser = PageParser()
    parser.feed(" ".join([product.get("name", ""), product.get("short_description", ""), product.get("description", "")]))
    return " ".join(parser.text)


def choose_product(products: List[Dict[str, Any]], selection: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    matches = [product for product in products if product.get("slug") == selection["slug"]]
    if not matches:
        return None
    if len(matches) != 1:
        raise RuntimeError(f"Expected one product for {selection['slug']}; found {len(matches)}")
    return matches[0]


def selected_source(product: Dict[str, Any], selection: Dict[str, Any]) -> Dict[str, Any]:
    variant_label = selection.get("variant")
    source = product
    if variant_label:
        variants = [
            variant for variant in product.get("variations", [])
            if any(attribute.get("value") == variant_label.replace("/", "-") or attribute.get("value") == variant_label
                   for attribute in variant.get("attributes", []))
        ]
        if len(variants) != 1:
            raise RuntimeError(f"{selection['slug']}: expected variant {variant_label}, found {len(variants)}")
        source = json.loads(fetch(f"https://protidehealth.com/wp-json/wc/store/v1/products/{variants[0]['id']}").decode("utf-8"))
        if variant_label not in source.get("variation", ""):
            raise RuntimeError(f"{selection['slug']}: variation label changed: {source.get('variation')!r}")
    else:
        searchable = plain_source(product)
        missing = [term for term in selection.get("source_terms", []) if term not in searchable]
        if missing:
            raise RuntimeError(f"{selection['slug']}: missing expected presentation terms: {missing}")
    return source


def coa_metadata(product_url: str, pattern: str, verified_at: str) -> Optional[Dict[str, Any]]:
    require_public_source_url(product_url, "/product/")
    product_page = parse_page(product_url)
    matches = list(dict.fromkeys(
        link for link in product_page.links if re.search(pattern, link, re.IGNORECASE)
    ))
    if not matches:
        return None
    # Product pages can retain historical lots. Their public order presents the
    # active reference first; preserve that order rather than guessing by lot ID.
    coa_url = matches[0]
    require_public_source_url(coa_url, "/certificates/")
    coa_page = parse_page(coa_url)
    text = " ".join(coa_page.text)
    lot = re.search(r"\bLot\s+([A-Za-z0-9][A-Za-z0-9 /-]*?)\s+COA\s+\d+", text)
    lab = re.search(r"COA by\s+(.+?)\s+Lot\s+", text)
    method = re.search(r"Test Method\s+(.+?)\s+Identity\s+", text)
    if not (lot and lab and method):
        raise RuntimeError(f"COA metadata shape changed for {coa_url}")
    methods = []
    method_text = method.group(1).strip()
    if "HPLC" in method_text.upper():
        methods.append("HPLC")
    if "MS" in method_text.upper():
        methods.append("LC-MS")
    if not methods:
        raise RuntimeError(f"COA test method is not recognized for {coa_url}: {method_text!r}")
    return {
        "url": coa_url,
        "kind": "source-reference",
        "label": "COA de referencia de la fuente",
        "lot": lot.group(1).strip(),
        "lab": lab.group(1).strip(),
        "methods": methods,
        "sourceDocumentTitle": " ".join(coa_page.title),
        "verifiedAt": verified_at,
    }


def build_catalog() -> Dict[str, Any]:
    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    raw = json.loads(fetch(API_URL).decode("utf-8"))
    if not isinstance(raw, list) or len(raw) < 12:
        raise RuntimeError(f"Store API returned an unexpected product list ({type(raw).__name__}, count={len(raw) if isinstance(raw, list) else 'n/a'})")

    normalized = []
    for selection in SELECTIONS:
        product = choose_product(raw, selection)
        if product is None:
            normalized.append({
                "code": selection["code"],
                "name": selection["name"],
                "presentation": "Presentación por confirmar",
                "status": "evaluation",
                "researchContext": selection["research"],
                "source": {"catalogUrl": API_URL, "productUrl": None, "sourceTitle": None, "fetchedAt": fetched_at},
                "sourceUsdCents": None,
                "basePriceCentavos": None,
                "coa": None,
            })
            continue

        source = selected_source(product, selection)
        prices = source.get("prices", {})
        if prices.get("currency_code") != "USD" or prices.get("currency_minor_unit") != 2:
            raise RuntimeError(f"{selection['slug']}: expected USD with 2 minor units")
        if not str(prices.get("price", "")).isdigit() or int(prices["price"]) <= 0:
            raise RuntimeError(f"{selection['slug']}: missing or invalid public USD price")
        source_usd_cents = int(prices["price"])
        price_centavos = base_price_centavos(source_usd_cents)
        margin = margin_bps(source_usd_cents, price_centavos)
        if not 4000 <= margin <= 5000:
            raise RuntimeError(f"{selection['slug']}: clean-price margin {margin / 100:.2f}% is outside 40–50%")
        product_url = product.get("permalink")
        if not product_url or not product_url.startswith("https://protidehealth.com/product/"):
            raise RuntimeError(f"{selection['slug']}: missing or unexpected product URL")
        coa = coa_metadata(product_url, selection["coa"], fetched_at)
        status = "available" if coa else "coa_pending"
        normalized.append({
            "code": selection["code"],
            "name": selection["name"],
            "presentation": selection["presentation"],
            "status": status,
            "researchContext": selection["research"],
            "source": {
                "catalogUrl": API_URL,
                "productUrl": product_url,
                "sourceTitle": html.unescape(product.get("name", "")),
                "sourcePresentation": source.get("variation") or html.unescape(product.get("name", "")),
                "fetchedAt": fetched_at,
            },
            "sourceUsdCents": source_usd_cents,
            "basePriceCentavos": price_centavos,
            "grossMarginBasisPoints": margin,
            "coa": coa,
        })

    return {
        "schemaVersion": 1,
        "generatedAt": fetched_at,
        "sourceNotice": "Public catalog research input only; no reseller, affiliate, or authorization relationship is implied.",
        "pricingAssumptions": {
            "fxMxnCentavosPerUsd": FX_MXN_CENTAVOS_PER_USD,
            "landedUpliftBasisPoints": LANDED_UPLIFT_BPS,
            "targetMarginBasisPoints": TARGET_MARGIN_BPS,
            "acceptedMarginRangeBasisPoints": [4000, 5000],
            "cleanPriceIncrementCentavos": CLEAN_INCREMENT_CENTAVOS,
            "rule": "Nearest MXN 50; exact midpoint rounds upward.",
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
