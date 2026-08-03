#!/usr/bin/env python3
"""Import Mereon's multibrand catalog from public supplier storefronts.

This script uses only public, unauthenticated pages. Supplier data is a research
input, not evidence of reseller affiliation. Descriptions are original and any
source-shape change in a listed product fails visibly.
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
TARGET_PROFIT_MARKUP_BPS = 3500
IVA_BPS = 1600
CLEAN_INCREMENT_CENTAVOS = 1000

LIMITLESS_OVERRIDES = {
    "BPC-157-10": {
        "sourceUsdCents": 9999,
        "productUrl": "https://limitlesslifenootropics.com/product/bpc-157/",
        "priceEvidenceUrl": "https://limitlesslifenootropics.com/product/bpc-157/",
        "sourcePresentation": "BPCSF-US-10MG · 10 mg · Premium · Lyophilized",
        "imageUrl": "https://cdn11.bigcommerce.com/s-abfevmkahe/images/stencil/original/products/217/824/BPC-157_10MG_.SINGLE.VIAL__08417.1780584885.png",
    },
    "TB500-10": {
        "sourceUsdCents": 13399,
        "productUrl": "https://limitlesslifenootropics.com/product/tb-500/",
        "priceEvidenceUrl": "https://limitlesslifenootropics.com/product/tb-500/",
        "sourcePresentation": "TB4-US-10MG · 10 mg · Premium · Lyophilized",
        "imageUrl": "https://cdn11.bigcommerce.com/s-abfevmkahe/images/stencil/original/products/186/891/THYMOSIN_BETA_4_TB-500_10MG.SINGLE.VIAL__04024.1762297179.png",
    },
    "MOTSC-10": {
        "sourceUsdCents": 9999,
        "productUrl": "https://limitlesslifenootropics.com/product/mots-c/",
        "priceEvidenceUrl": "https://limitlesslifenootropics.com/product/mots-c/",
        "sourcePresentation": "MOTS-US-10MG · 10 mg · Premium · Lyophilized",
        "imageUrl": "https://cdn11.bigcommerce.com/s-abfevmkahe/images/stencil/original/products/187/852/MOTS-C_10MG_.SINGLE.VIAL__34440.1762231552.png",
    },
    "TA1-10": {
        "sourceUsdCents": 13199,
        "productUrl": "https://limitlesslifenootropics.com/product/thymosin-alpha-1/",
        "priceEvidenceUrl": "https://limitlesslifenootropics.com/product/thymosin-alpha-1/",
        "sourcePresentation": "TA1-US-10MG · 10 mg · Premium · Lyophilized",
        "imageUrl": "https://cdn11.bigcommerce.com/s-abfevmkahe/images/stencil/original/products/185/885/THYMOSIN_ALPHA_1_10MG.SINGLE.VIAL__29102.1762296430.png",
    },
}

SELECTIONS = [
    {
        "code": "BPC-157-10",
        "name": "BPC-157",
        "slug": "bpc-157",
        "variant": "10mg",
        "presentation": "10 mg · vial Premium liofilizado",
        "coa": r"/certificates/bpc-157-10mg-coa-\d+/?$",
        "research": "Péptido sintético de 15 aminoácidos estudiado en modelos preclínicos de señalización y respuesta tisular; la evidencia no establece beneficios clínicos.",
    },
    {
        "code": "TB500-10",
        "name": "TB-500",
        "slug": "tb-500-10mg",
        "variant": None,
        "presentation": "10 mg · vial Premium liofilizado",
        "source_terms": ["10mg"],
        "coa": r"/certificates/tb-500-10mg-coa-\d+/?$",
        "research": "Péptido sintético relacionado con thymosin beta-4, investigado en sistemas preclínicos de dinámica celular; sin indicaciones terapéuticas aprobadas.",
    },
    {
        "code": "MOTSC-10",
        "name": "MOTS-c",
        "slug": "mots-c-peptide",
        "variant": "10mg",
        "presentation": "10 mg · vial Premium liofilizado",
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
        "presentation": "10 mg · vial Premium liofilizado",
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
    numerator = (
        source_usd_cents
        * FX_MXN_CENTAVOS_PER_USD
        * (10_000 + LANDED_UPLIFT_BPS)
        * (10_000 + TARGET_PROFIT_MARKUP_BPS)
    )
    denominator = 100 * 10_000 * 10_000
    clean_units = round_div(numerator, denominator * CLEAN_INCREMENT_CENTAVOS)
    return clean_units * CLEAN_INCREMENT_CENTAVOS


def profit_markup_bps(source_usd_cents: int, price_centavos: int) -> int:
    landed_numerator = source_usd_cents * FX_MXN_CENTAVOS_PER_USD * (10_000 + LANDED_UPLIFT_BPS)
    landed_denominator = 100 * 10_000
    profit_numerator = price_centavos * landed_denominator - landed_numerator
    return round_div(profit_numerator * 10_000, landed_numerator)


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
        profit_markup = profit_markup_bps(source_usd_cents, price_centavos)
        if not 3450 <= profit_markup <= 3550:
            raise RuntimeError(f"{selection['slug']}: clean-price profit markup {profit_markup / 100:.2f}% is outside 34.5–35.5%")
        product_url = product.get("permalink")
        if not product_url or not product_url.startswith("https://protidehealth.com/product/"):
            raise RuntimeError(f"{selection['slug']}: missing or unexpected product URL")
        coa = coa_metadata(product_url, selection["coa"], fetched_at)
        status = "available" if coa else "coa_pending"
        images = product.get("images") or []
        image_index = 1 if selection["code"] == "GHKCU-50" else 0
        if len(images) <= image_index:
            raise RuntimeError(f"{selection['slug']}: missing matching public product image")
        source_image = images[image_index]
        source_image_url = source_image.get("src", "")
        if not source_image_url.startswith("https://protidehealth.com/wp-content/uploads/"):
            raise RuntimeError(f"{selection['slug']}: unexpected product image URL")
        image_filename = f"{selection['code'].lower()}.png"
        record = {
            "code": selection["code"],
            "name": selection["name"],
            "presentation": selection["presentation"],
            "status": status,
            "researchContext": selection["research"],
            "brandSupplier": {
                "brand": "Protide Health",
                "role": "Marca / proveedor de referencia",
                "notice": "La identificación de marca o proveedor no implica afiliación, autorización o distribución oficial.",
            },
            "source": {
                "catalogUrl": API_URL,
                "productUrl": product_url,
                "sourceTitle": html.unescape(product.get("name", "")),
                "sourcePresentation": source.get("variation") or html.unescape(product.get("name", "")),
                "fetchedAt": fetched_at,
            },
            "sourceUsdCents": source_usd_cents,
            "basePriceCentavos": price_centavos,
            "profitMarkupBasisPoints": profit_markup,
            "image": {
                "assetPath": f"assets/images/products/{image_filename}",
                "sourceUrl": source_image_url,
                "alt": f"Fotografía de referencia de {selection['name']} {selection['presentation']}",
                "notice": "Imagen pública de referencia del catálogo fuente; no implica afiliación o autorización.",
            },
            "coa": coa,
        }
        limitless = LIMITLESS_OVERRIDES.get(selection["code"])
        if limitless:
            limitless_price = base_price_centavos(limitless["sourceUsdCents"])
            limitless_markup = profit_markup_bps(limitless["sourceUsdCents"], limitless_price)
            if not 3450 <= limitless_markup <= 3550:
                raise RuntimeError(f"{selection['code']}: Limitless clean-price markup outside range")
            record.update({
                "status": "coa_pending",
                "brandSupplier": {
                    "brand": "Limitless Biotech",
                    "role": "Marca / proveedor de referencia",
                    "notice": "La identificación de marca o proveedor no implica afiliación, autorización o distribución oficial.",
                },
                "source": {
                    "catalogUrl": "https://limitlesslifenootropics.com/shop",
                    "productUrl": limitless["productUrl"],
                    "priceEvidenceUrl": limitless["priceEvidenceUrl"],
                    "sourceTitle": selection["name"],
                    "sourcePresentation": limitless["sourcePresentation"],
                    "fetchedAt": fetched_at,
                },
                "sourceUsdCents": limitless["sourceUsdCents"],
                "basePriceCentavos": limitless_price,
                "profitMarkupBasisPoints": limitless_markup,
                "image": {
                    "assetPath": f"assets/images/products/{image_filename}",
                    "sourceUrl": limitless["imageUrl"],
                    "alt": f"Fotografía de referencia Limitless Biotech de {selection['name']} {selection['presentation']}",
                    "notice": "Imagen pública de referencia del catálogo fuente; no implica afiliación o autorización.",
                },
                "coa": {
                    "url": None,
                    "kind": "pending",
                    "label": "COA pendiente de asignación/publicación para este lote.",
                    "lot": None,
                    "lab": None,
                    "methods": [],
                    "sourceDocumentTitle": None,
                    "verifiedAt": None,
                },
            })
        normalized.append(record)

    return {
        "schemaVersion": 1,
        "generatedAt": fetched_at,
        "sourceNotice": "Supplier catalog research input; Limitless prices reflect the authenticated Premium 10 mg variant. No reseller, affiliate, or authorization relationship is implied.",
        "pricingAssumptions": {
            "fxMxnCentavosPerUsd": FX_MXN_CENTAVOS_PER_USD,
            "landedUpliftBasisPoints": LANDED_UPLIFT_BPS,
            "targetProfitMarkupBasisPoints": TARGET_PROFIT_MARKUP_BPS,
            "ivaIncludedBasisPoints": IVA_BPS,
            "acceptedProfitMarkupRangeBasisPoints": [3450, 3550],
            "cleanPriceIncrementCentavos": CLEAN_INCREMENT_CENTAVOS,
            "rule": "Public supplier price converted at FX, plus 13% landed uplift, plus 35% profit markup. Final consumer price includes IVA; nearest MXN 10; exact midpoint rounds upward.",
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
