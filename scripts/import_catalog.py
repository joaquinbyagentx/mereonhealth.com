#!/usr/bin/env python3
"""Import Mereon's catalog from reviewed public supplier storefronts.

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

from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, quote, urlparse

SOURCE_ORIGIN = "ascensionpeptides.com"
SHOP_URL = "https://ascensionpeptides.com/shop/"
API_URL = "https://ascensionpeptides.com/wp-json/wc/store/v1/products?per_page=100"
PROTIDE_ORIGIN = "protidehealth.com"
SERMORELIN_PRODUCT_URL = "https://protidehealth.com/product/sermorelin/"
SERMORELIN_COA_PAGE_URL = "https://protidehealth.com/certificates/sermorelin-5mg-coa-2605280407/"
SERMORELIN_COA_PDF_URL = "https://protidehealth.com/wp-content/uploads/2026/06/Sermorelin-5mg-June.pdf"
SERMORELIN_IMAGE_URL = "https://protidehealth.com/wp-content/uploads/2026/02/Sermorelin_Protide-Cover-Image-1.png"
SERMORELIN_COA_SHA256 = "5a086b451f3e6a3d40601ee509963211b9510fe4cd4147063407d37b7eba80a6"
SERMORELIN_IMAGE_SHA256 = "736b9e2a4f875cec6768a8e40c15af68284013bcdcbbc4e619911f412609dbc6"
SERMORELIN_LOCAL_IMAGE_SHA256 = "eeef35a4f4cd70f2ce81d054c4b8d6ed3b387519b518515ea9ec176075805a58"
GLP2_15_PRODUCT_URL = "https://protidehealth.com/product/glp2/"
GLP2_15_API_URL = "https://protidehealth.com/wp-json/wc/store/v1/products/19465"
GLP2_15_IMAGE_URL = "https://protidehealth.com/wp-content/uploads/2026/03/GLP-2-15mg.png"
GLP2_15_COA_PAGE_URL = "https://protidehealth.com/certificates/glp-2-15mg-coa-2606180382/"
GLP2_15_COA_PDF_URL = "https://protidehealth.com/wp-content/uploads/2026/06/GLP-2-15mg-June-23rd-COA.pdf"
IPAMORELIN_10_PRODUCT_URL = "https://protidehealth.com/product/ipamorelin-10mg/"
IPAMORELIN_10_API_URL = "https://protidehealth.com/wp-json/wc/store/v1/products/11892"
IPAMORELIN_10_IMAGE_URL = "https://protidehealth.com/wp-content/uploads/2026/02/Ipamorelin_Protide-Cover-Image-1.png"
IPAMORELIN_10_COA_PAGE_URL = "https://protidehealth.com/certificates/ipamorelin-10mg-coa-2606260176/"
IPAMORELIN_10_COA_PDF_URL = "https://protidehealth.com/wp-content/uploads/2026/06/Ipamorelin-10mg-June-.pdf"
ALLOWED_SOURCE_ORIGINS = {SOURCE_ORIGIN, PROTIDE_ORIGIN}
# The historical www host now serves a mismatched TLS certificate; use the
# certificate-valid apex host and the official date-range endpoint.
FX_SOURCE_URL = "https://dof.gob.mx/indicadores_detalle.php"
FX_SOURCE_DATE = "2026-08-03"
EXISTING_RECORD_VERIFIED_AT = "2026-08-04T04:21:36Z"
USER_AGENT = "MereonCatalogImporter/2.0 (+https://mereonhealth.com)"
OUTPUT_PATH = Path("data/catalog.json")

FX_MXN_TEN_THOUSANDTHS_PER_USD = 173_288
SERMORELIN_FX_MXN_TEN_THOUSANDTHS_PER_USD = 172_317
SERMORELIN_FX_SOURCE_DATE = "2026-08-06"
LANDED_UPLIFT_BPS = 1300
TARGET_PROFIT_CENTAVOS = 60_000
IVA_BPS = 1600
CLEAN_INCREMENT_CENTAVOS = 5000
ACCEPTED_EFFECTIVE_MARGIN_CENTAVOS = [60_000, 64_999]

SUPPLIER_ORDER = {
    "number": "33332",
    "date": "2026-08-03",
    "lines": {
        "T-10": {"quantity": 3, "unitUsdCents": 4850},
        "BPC-157-10": {"quantity": 1, "unitUsdCents": 4900},
        "KLOW-80": {"quantity": 1, "unitUsdCents": 12500},
        "CJCIPA-5-5": {"quantity": 1, "unitUsdCents": 7000},
        "TA1-10": {"quantity": 1, "unitUsdCents": 7100},
        "IPAMORELIN-5": {"quantity": 1, "unitUsdCents": 4400},
        "TESA-5": {"quantity": 1, "unitUsdCents": 5000},
        "GHKCU-100-10ML": {"quantity": 1, "unitUsdCents": 7500},
    },
}

# Confirmed Mereon inventory that is not attributed to supplier order #33332.
# Keep this separate so stock can be sold without fabricating purchase-order
# provenance. The current public supplier price is the approved cost basis.
ADDITIONAL_CONFIRMED_INVENTORY = {
    "SEMAX-10": {"quantity": 3, "unitUsdCents": 5999},
}

# Current, physically confirmed Protide inventory. These values are importer-only
# pricing inputs and are intentionally omitted from the generated public catalog.
PROTIDE_CONFIRMED_INVENTORY = {
    "GLP2-15": {"quantity": 4, "unitUsdCents": 13900},
    "IPAMORELIN-10": {"quantity": 4, "unitUsdCents": 7500},
    "KLOW-80": {"quantity": 2, "unitUsdCents": 17500},
}

# Existing catalog prices are release-approved values. A supplier's later
# storefront price change must not silently reprice unrelated Mereon products
# during a narrowly scoped import.
APPROVED_EXISTING_PUBLIC_PRICES_CENTAVOS = {
    "T-10": 155_000,
    "BPC-157-10": 160_000,
    "SEMAX-10": 180_000,
    "TB500-5": 170_000,
    "MOTSC-10": 160_000,
    "GHKCU-100-10ML": 210_000,
    "CJCIPA-5-5": 200_000,
    "IPAMORELIN-5": 150_000,
    "TA1-10": 200_000,
    "TESA-5": 160_000,
    "EPITHALON-10": 150_000,
    "KPV-10": 160_000,
    "GLOW-70": 305_000,
    "KLOW-80": 405_000,
    "WOLVERINE-10-10": 240_000,
}


def confirmed_inventory_line(code: str) -> Optional[Dict[str, int]]:
    return (
        PROTIDE_CONFIRMED_INVENTORY.get(code)
        or SUPPLIER_ORDER["lines"].get(code)
        or ADDITIONAL_CONFIRMED_INVENTORY.get(code)
    )

SELECTIONS = [
    {
        "code": "T-10",
        "name": "Tirzepatida (T-10)",
        "slug": "t-10",
        "sourceTitle": "T-10",
        "presentation": "10 mg",
        "coa": None,
        "sourceCoaReviewPending": True,
        "researchArea": "Agonismo dual GIP/GLP-1 y metabolismo",
        "researchDescription": "Tirzepatida, péptido sintético investigado como agonista dual de los receptores GIP y GLP-1 para estudiar señalización metabólica, regulación de glucosa y balance energético en modelos de investigación. Exclusivamente para investigación; no para uso humano.",
    },
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
        "code": "SEMAX-10",
        "name": "Semax",
        "slug": "semax-10mg",
        "sourceTitle": "Semax (10MG)",
        "presentation": "10 mg",
        "coa": {
            "url": "https://ascensionpeptides.com/wp-content/uploads/2026/06/Semax_30-05260628_COA-combined.pdf",
            "sha256": "ce473d2e7f0c3d5965e04f2366098082f35209d4438746e7d9ef47c1b1abf41e",
            "lot": "30-05260628", "lab": "Kovera Labs", "methods": [],
        },
        "researchArea": "Neuroprotección y función cognitiva",
        "researchDescription": "Heptapéptido sintético derivado de ACTH, investigado en modelos preclínicos para estudiar mecanismos de neuroprotección, función cognitiva y regulación de BDNF, sin implicar uso humano ni eficacia terapéutica.",
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
        "code": "GHKCU-100-10ML",
        "name": "GHK-Cu",
        "slug": "ghk-cu-100mg-10ml",
        "sourceTitle": "GHK-CU (100MG) 10mL",
        "presentation": "100 mg · 10 mL",
        "coa": None,
        "sourceCoaReviewPending": True,
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
        "code": "IPAMORELIN-5",
        "name": "Ipamorelin",
        "slug": "ipamorelin-5mg",
        "sourceTitle": "Ipamorelin (5MG)",
        "presentation": "5 mg",
        "coa": None,
        "sourceCoaReviewPending": True,
        "researchArea": "Señales hormonales",
        "researchDescription": "Pentapéptido investigado para entender la señalización del receptor de grelina y su relación experimental con la liberación de hormona de crecimiento.",
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

SERMORELIN_SELECTION = {
    "code": "SERMORELIN-5",
    "name": "Sermorelin",
    "presentation": "5 mg · polvo liofilizado · vial de 3 mL",
    "researchArea": "Señalización de GHRH",
    "researchDescription": "Péptido sintético investigado en modelos preclínicos para estudiar la señalización del receptor de la hormona liberadora de hormona de crecimiento (GHRH) y sus respuestas celulares. Exclusivamente para investigación; no para uso humano.",
}

PROTIDE_SELECTIONS = [
    {
        "code": "GLP2-15",
        "name": "GLP-2",
        "presentation": "15 mg · polvo liofilizado · vial de 3 mL",
        "researchArea": "Señalización intestinal de GLP-2",
        "researchDescription": "Péptido sintético investigado en modelos preclínicos para estudiar la señalización del receptor GLP-2 y las respuestas celulares de modelos intestinales. Exclusivamente para investigación; no para uso humano.",
        "productUrl": GLP2_15_PRODUCT_URL,
        "apiUrl": GLP2_15_API_URL,
        "sourceTitle": "GLP-2 - 15mg",
        "sourceSku": "SQ3259733-15",
        "sourceDescription": "15mg lyophilized vial of GLP-2.",
        "sourceUsdCents": 13900,
        "imageUrl": GLP2_15_IMAGE_URL,
        "imageSha256": "745aa9a0047a7123b4cc9ae2ec3f8bba3e6e3ab777275fb4b72ccd30963d582e",
        "localImageSha256": "633b74292857498cbeec43a1d08434bcf2a807cec06949c050ac854e0e0ca3f9",
        "imageAssetPath": "assets/images/products/glp2-15.png",
        "coaPageUrl": GLP2_15_COA_PAGE_URL,
        "coaPdfUrl": GLP2_15_COA_PDF_URL,
        "coaSha256": "b6b15ad7df3ec9b04fad0bfe825ed8aa11901e6aa2210fbe53a3a3807dff2d47",
        "coaAssetPath": "assets/documents/glp2-15-coa-2606180382.pdf",
        "coaNumber": "2606180382",
        "lot": "PH-ze15-0410",
        "purityPercent": "99.52%",
        "reportedDate": "2026-06-22",
    },
    {
        "code": "IPAMORELIN-10",
        "name": "Ipamorelin",
        "presentation": "10 mg · polvo liofilizado · vial de 3 mL",
        "researchArea": "Señalización del receptor de grelina",
        "researchDescription": "Pentapéptido sintético investigado en modelos preclínicos para estudiar la señalización del receptor de grelina GHS-R1a y sus respuestas celulares. Exclusivamente para investigación; no para uso humano.",
        "productUrl": IPAMORELIN_10_PRODUCT_URL,
        "apiUrl": IPAMORELIN_10_API_URL,
        "sourceTitle": "Ipamorelin 10mg",
        "sourceSku": "SQ1051651",
        "sourceDescription": "Ipamorelin 10mg Lyophilized Powder in 3mL vial.",
        "sourceUsdCents": 7500,
        "imageUrl": IPAMORELIN_10_IMAGE_URL,
        "imageSha256": "e109762ce41bf22d0e8d978fc10b73448db309025591627614cf3991c00e15a5",
        "localImageSha256": "df4a7642bc2b528ad2bf3d73535dca9a5b6bc57ff7e7c3bc1d3d925ff2a114d4",
        "imageAssetPath": "assets/images/products/ipamorelin-10.png",
        "coaPageUrl": IPAMORELIN_10_COA_PAGE_URL,
        "coaPdfUrl": IPAMORELIN_10_COA_PDF_URL,
        "coaSha256": "f7bb2f84b21f5b2ebdd24810cbd138be1c0a8d3077cfa847987778e45c8e7762",
        "coaAssetPath": "assets/documents/ipamorelin-10-coa-2606260176.pdf",
        "coaNumber": "2606260176",
        "lot": "PH-ip10-0313",
        "purityPercent": "99.82%",
        "reportedDate": "2026-06-29",
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


def require_source_origin(url: str, expected_origin: str = SOURCE_ORIGIN) -> None:
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != expected_origin
        or parsed.port is not None
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise RuntimeError(f"unexpected public source URL: {url}")


def require_fx_source_url(url: str) -> None:
    parsed = urlparse(url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in {"www.dof.gob.mx", "dof.gob.mx"}
        or parsed.path != "/indicadores_detalle.php"
        or parsed.port is not None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or set(query) != {"cod_tipo_indicador", "dfecha", "hfecha"}
        or query["cod_tipo_indicador"] != ["158"]
        or query["dfecha"] != query["hfecha"]
        or len(query["dfecha"]) != 1
        or not re.fullmatch(r"\d{2}/\d{2}/\d{4}", query["dfecha"][0])
    ):
        raise RuntimeError(f"unexpected public source URL: {url}")


def require_fetch_url(url: str, expected_origin: Optional[str] = None) -> None:
    parsed = urlparse(url)
    if parsed.hostname in {"www.dof.gob.mx", "dof.gob.mx"}:
        require_fx_source_url(url)
        return
    origin = expected_origin or urlparse(url).hostname or ""
    if origin not in ALLOWED_SOURCE_ORIGINS:
        raise RuntimeError(f"unexpected public source URL: {url}")
    require_source_origin(url, origin)


def fetch(url: str) -> bytes:
    expected_origin = urlparse(url).hostname
    require_fetch_url(url, expected_origin)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError(f"HTTP {response.status} for {url}")
            if expected_origin in {"www.dof.gob.mx", "dof.gob.mx"}:
                require_fx_source_url(response.geturl())
            else:
                require_source_origin(response.geturl(), expected_origin or "")
            return response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"Unable to fetch public source {url}: {exc}") from exc


def parse_page(url: str) -> PageParser:
    parser = PageParser()
    parser.feed(fetch(url).decode("utf-8", "replace"))
    return parser


def require_public_source_url(url: str, path_prefix: str, expected_origin: str = SOURCE_ORIGIN) -> None:
    require_source_origin(url, expected_origin)
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


def ceil_div(numerator: int, denominator: int) -> int:
    if numerator < 0 or denominator <= 0:
        raise ValueError("ceil_div accepts a non-negative numerator and positive denominator")
    return (numerator + denominator - 1) // denominator


def base_price_centavos(
    source_usd_cents: int,
    fx_mxn_ten_thousandths_per_usd: int = FX_MXN_TEN_THOUSANDTHS_PER_USD,
) -> int:
    landed_numerator = source_usd_cents * fx_mxn_ten_thousandths_per_usd * (10_000 + LANDED_UPLIFT_BPS)
    landed_denominator = 10_000 * 10_000
    target_price_numerator = landed_numerator + TARGET_PROFIT_CENTAVOS * landed_denominator
    clean_units = ceil_div(target_price_numerator, landed_denominator * CLEAN_INCREMENT_CENTAVOS)
    return clean_units * CLEAN_INCREMENT_CENTAVOS


def profit_margin_centavos(
    source_usd_cents: int,
    price_centavos: int,
    fx_mxn_ten_thousandths_per_usd: int = FX_MXN_TEN_THOUSANDTHS_PER_USD,
) -> int:
    landed_numerator = source_usd_cents * fx_mxn_ten_thousandths_per_usd * (10_000 + LANDED_UPLIFT_BPS)
    landed_denominator = 10_000 * 10_000
    profit_numerator = price_centavos * landed_denominator - landed_numerator
    return profit_numerator // landed_denominator


def plain_source(product: Dict[str, Any]) -> str:
    parser = PageParser()
    parser.feed(" ".join([product.get("name", ""), product.get("short_description", ""), product.get("description", "")]))
    return " ".join(parser.text)


def fetch_exchange_rate(
    source_date: str = FX_SOURCE_DATE,
    expected_scaled_rate: int = FX_MXN_TEN_THOUSANDTHS_PER_USD,
) -> int:
    try:
        display_date = datetime.strptime(source_date, "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError as exc:
        raise RuntimeError(f"invalid reviewed DOF source date: {source_date}") from exc
    if expected_scaled_rate <= 0:
        raise RuntimeError("invalid reviewed DOF USD/MXN rate")
    source_url = (
        f"{FX_SOURCE_URL}?cod_tipo_indicador=158"
        f"&dfecha={quote(display_date, safe='')}&hfecha={quote(display_date, safe='')}"
    )
    page = fetch(source_url).decode("utf-8", "replace")
    parsed_page = PageParser()
    parsed_page.feed(page)
    page_text = " ".join(parsed_page.text)
    row_date = datetime.strptime(source_date, "%Y-%m-%d").strftime("%d-%m-%Y")
    match = re.search(
        rf"DOLAR\s+FECHA\s+{re.escape(display_date)}\s+a\s+{re.escape(display_date)}"
        rf"\s+Fecha\s+Valor\s+{re.escape(row_date)}\s+([0-9]+\.[0-9]{{6}})",
        page_text,
    )
    if not match:
        raise RuntimeError("DOF response does not contain the reviewed USD/date")
    published_rate = match.group(1)
    if not published_rate.endswith("00"):
        raise RuntimeError("DOF USD/MXN rate has unexpected precision")
    scaled = int(published_rate[:-2].replace(".", ""))
    if scaled != expected_scaled_rate:
        expected_display = f"{expected_scaled_rate / 10_000:.4f}"
        raise RuntimeError(f"DOF USD/MXN rate changed from the reviewed {expected_display}")
    return scaled


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
    source_coa_review_pending: bool = False,
) -> Optional[Dict[str, Any]]:
    require_public_source_url(product_url, "/product/")
    product_page = parse_page(product_url)
    matches = list(dict.fromkeys(link for link in product_page.links if (
        link.startswith(f"https://{SOURCE_ORIGIN}/wp-content/uploads/")
        and urlparse(link).path.lower().endswith(".pdf")
    )))
    if expected is None:
        if matches and not source_coa_review_pending:
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


def require_sha256(document: bytes, expected_sha256: str, source_url: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise RuntimeError(f"{source_url}: reviewed evidence has no valid SHA-256 pin")
    actual_sha256 = hashlib.sha256(document).hexdigest()
    if actual_sha256 != expected_sha256:
        raise RuntimeError(
            f"{source_url}: reviewed evidence changed "
            f"(expected SHA-256 {expected_sha256}, got {actual_sha256})"
        )
    return actual_sha256


def sermorelin_record(verified_at: str, fx_mxn_ten_thousandths_per_usd: int) -> Dict[str, Any]:
    """Build the independently reviewed Protide 5 mg variant and fail closed on drift."""
    require_public_source_url(SERMORELIN_PRODUCT_URL, "/product/", PROTIDE_ORIGIN)
    product_document = fetch(SERMORELIN_PRODUCT_URL)
    product_html = product_document.decode("utf-8", "replace")
    reviewed_product_markers = [
        '"sku":"SQ8811330-5"',
        '"name":"Sermorelin - 5mg"',
        '"description":"5mg Lyophilized Powder in 3ml Vial"',
        '"price":"55"',
        '"priceCurrency":"USD"',
        '"availability":"http://schema.org/InStock"',
    ]
    missing_product_markers = [marker for marker in reviewed_product_markers if marker not in product_html]
    if missing_product_markers:
        raise RuntimeError(
            "Sermorelin 5 mg public variant evidence changed or is incomplete: "
            + ", ".join(missing_product_markers)
        )

    coa_page = fetch(SERMORELIN_COA_PAGE_URL)
    coa_html = coa_page.decode("utf-8", "replace")
    coa_parser = PageParser()
    coa_parser.feed(coa_html)
    coa_text = " ".join(coa_parser.text)
    reviewed_coa_markers = [
        "Sermorelin 5mg",
        "COA 2605280407",
        "Reported 05/30/2026",
        "99.21%",
        "Sermorelin 5mg · Lot PH sm5 0327",
    ]
    missing_coa_markers = [marker for marker in reviewed_coa_markers if marker not in coa_text]
    if missing_coa_markers:
        raise RuntimeError(
            "Sermorelin 5 mg COA page evidence changed or is incomplete: "
            + ", ".join(missing_coa_markers)
        )
    linked_pdfs = list(dict.fromkeys(
        link for link in coa_parser.links
        if link.startswith(f"https://{PROTIDE_ORIGIN}/wp-content/uploads/")
        and urlparse(link).path.lower().endswith(".pdf")
    ))
    if SERMORELIN_COA_PDF_URL not in linked_pdfs:
        raise RuntimeError("Sermorelin 5 mg reviewed COA PDF is no longer linked from its certificate page")

    coa_document = fetch(SERMORELIN_COA_PDF_URL)
    if not coa_document.startswith(b"%PDF-"):
        raise RuntimeError("Sermorelin 5 mg reviewed COA is not a PDF")
    coa_sha256 = require_sha256(coa_document, SERMORELIN_COA_SHA256, SERMORELIN_COA_PDF_URL)

    image_document = fetch(SERMORELIN_IMAGE_URL)
    if not image_document.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Sermorelin 5 mg reviewed source image is not a PNG")
    image_sha256 = require_sha256(image_document, SERMORELIN_IMAGE_SHA256, SERMORELIN_IMAGE_URL)

    price_centavos = base_price_centavos(5500, fx_mxn_ten_thousandths_per_usd)
    if price_centavos != 170_000 or price_centavos == 155_000:
        raise RuntimeError("Sermorelin 5 mg corrected price guard failed; expected exactly MXN 1,700")

    return {
        "code": SERMORELIN_SELECTION["code"],
        "name": SERMORELIN_SELECTION["name"],
        "presentation": SERMORELIN_SELECTION["presentation"],
        "status": "available",
        "researchArea": SERMORELIN_SELECTION["researchArea"],
        "researchDescription": SERMORELIN_SELECTION["researchDescription"],
        "brandSupplier": {
            "brand": "Protide Health",
            "role": "Marca / proveedor de referencia",
            "notice": "La identificación de marca o proveedor no implica afiliación, autorización o distribución oficial.",
        },
        "source": {
            "catalogUrl": SERMORELIN_PRODUCT_URL,
            "productUrl": SERMORELIN_PRODUCT_URL,
            "priceEvidenceUrl": SERMORELIN_PRODUCT_URL,
            "sourceTitle": "Sermorelin - 5mg",
            "sourcePresentation": "5mg Lyophilized Powder in 3ml Vial",
            "fetchedAt": verified_at,
        },
        "stockQuantity": 0,
        "purchaseEnabled": False,
        "basePriceCentavos": price_centavos,
        "image": {
            "assetPath": "assets/images/products/sermorelin-5.png",
            "sourceUrl": SERMORELIN_IMAGE_URL,
            "sourceSha256": image_sha256,
            "localizedSha256": SERMORELIN_LOCAL_IMAGE_SHA256,
            "alt": "Fotografía de referencia Protide Health de Sermorelin 5 mg en vial",
            "notice": "Imagen pública de referencia del catálogo fuente; no implica afiliación o autorización.",
        },
        "coa": {
            "url": SERMORELIN_COA_PDF_URL,
            "assetPath": "assets/documents/sermorelin-5-coa-2605280407.pdf",
            "sourcePageUrl": SERMORELIN_COA_PAGE_URL,
            "sourceSha256": coa_sha256,
            "kind": "source-reference",
            "label": "COA de referencia publicado por Protide Health",
            "lot": "PH-sm5-0327",
            "lab": "Freedom Diagnostics",
            "methods": ["HPLC-MS"],
            "purityPercent": "99.21%",
            "reportedDate": "2026-05-30",
            "sourceDocumentTitle": "Certificate of Analysis — Sermorelin 5 mg — 2605280407",
            "verifiedAt": verified_at,
        },
    }


def protide_record(selection: Dict[str, Any], verified_at: str, fx_rate: int) -> Dict[str, Any]:
    """Validate one exact Protide SKU, its media, and its reviewed COA."""
    for url, prefix in [
        (selection["productUrl"], "/product/"),
        (selection["apiUrl"], "/wp-json/wc/store/v1/products/"),
        (selection["imageUrl"], "/wp-content/uploads/"),
        (selection["coaPageUrl"], "/certificates/"),
        (selection["coaPdfUrl"], "/wp-content/uploads/"),
    ]:
        require_public_source_url(url, prefix, PROTIDE_ORIGIN)

    product_html = fetch(selection["productUrl"]).decode("utf-8", "replace")
    product_markers = [
        f'"sku":"{selection["sourceSku"]}"',
        f'"name":"{selection["sourceTitle"]}"',
        '"priceCurrency":"USD"',
        selection["sourceDescription"],
    ]
    page_price = selection["sourceUsdCents"] // 100
    if f'"price":"{page_price}"' not in product_html and f'"price":{page_price},' not in product_html:
        product_markers.append(f'exact USD page price {page_price}')
    missing = [marker for marker in product_markers if marker not in product_html]
    if missing:
        raise RuntimeError(f'{selection["code"]}: exact public product evidence changed: ' + ", ".join(missing))

    api_product = json.loads(fetch(selection["apiUrl"]).decode("utf-8"))
    prices = api_product.get("prices", {})
    images = api_product.get("images") or []
    if (
        api_product.get("sku") != selection["sourceSku"]
        or prices.get("currency_code") != "USD"
        or prices.get("currency_minor_unit") != 2
        or prices.get("price") != str(selection["sourceUsdCents"])
        or not images
        or images[0].get("src") != selection["imageUrl"]
    ):
        raise RuntimeError(f'{selection["code"]}: exact Store API variant evidence changed')

    coa_page = fetch(selection["coaPageUrl"])
    coa_parser = PageParser()
    coa_parser.feed(coa_page.decode("utf-8", "replace"))
    coa_text = " ".join(coa_parser.text)
    display_date = datetime.strptime(selection["reportedDate"], "%Y-%m-%d").strftime("%m/%d/%Y")
    coa_markers = [
        selection["sourceTitle"].replace(" - ", " "),
        f'Lot {selection["lot"]}',
        f'COA {selection["coaNumber"]}',
        f'Reported {display_date}',
        selection["purityPercent"],
        "Freedom Diagnostics",
        "HPLC-MS",
    ]
    missing = [marker for marker in coa_markers if marker not in coa_text]
    if missing:
        raise RuntimeError(f'{selection["code"]}: reviewed COA page evidence changed: ' + ", ".join(missing))
    linked_pdfs = {
        link for link in coa_parser.links
        if link.startswith(f"https://{PROTIDE_ORIGIN}/wp-content/uploads/")
        and urlparse(link).path.lower().endswith(".pdf")
    }
    if selection["coaPdfUrl"] not in linked_pdfs:
        raise RuntimeError(f'{selection["code"]}: reviewed COA PDF is no longer linked')

    image_document = fetch(selection["imageUrl"])
    if not image_document.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError(f'{selection["code"]}: reviewed source image is not a PNG')
    image_sha256 = require_sha256(image_document, selection["imageSha256"], selection["imageUrl"])
    local_image = Path(selection["imageAssetPath"])
    if not local_image.is_file() or hashlib.sha256(local_image.read_bytes()).hexdigest() != selection["localImageSha256"]:
        raise RuntimeError(f'{selection["code"]}: localized image is missing or changed')

    coa_document = fetch(selection["coaPdfUrl"])
    if not coa_document.startswith(b"%PDF-"):
        raise RuntimeError(f'{selection["code"]}: reviewed COA is not a PDF')
    coa_sha256 = require_sha256(coa_document, selection["coaSha256"], selection["coaPdfUrl"])
    local_coa = Path(selection["coaAssetPath"])
    if not local_coa.is_file() or hashlib.sha256(local_coa.read_bytes()).hexdigest() != coa_sha256:
        raise RuntimeError(f'{selection["code"]}: localized COA is missing or changed')

    inventory = confirmed_inventory_line(selection["code"])
    if not inventory or inventory["unitUsdCents"] != selection["sourceUsdCents"]:
        raise RuntimeError(f'{selection["code"]}: confirmed inventory does not match the exact source variant')
    price_centavos = base_price_centavos(selection["sourceUsdCents"], fx_rate)
    expected_prices = {"GLP2-15": 335_000, "IPAMORELIN-10": 210_000}
    if price_centavos != expected_prices[selection["code"]]:
        raise RuntimeError(f'{selection["code"]}: corrected public price guard failed')

    return {
        "code": selection["code"],
        "name": selection["name"],
        "presentation": selection["presentation"],
        "status": "available",
        "researchArea": selection["researchArea"],
        "researchDescription": selection["researchDescription"],
        "brandSupplier": {
            "brand": "Protide Health",
            "role": "Marca / proveedor de referencia",
            "notice": "La identificación de marca o proveedor no implica afiliación, autorización o distribución oficial.",
        },
        "source": {
            "catalogUrl": selection["productUrl"],
            "apiUrl": selection["apiUrl"],
            "productUrl": selection["productUrl"],
            "priceEvidenceUrl": selection["productUrl"],
            "sourceTitle": selection["sourceTitle"],
            "sourcePresentation": selection["sourceDescription"],
            "fetchedAt": verified_at,
        },
        "stockQuantity": inventory["quantity"],
        "purchaseEnabled": True,
        "basePriceCentavos": price_centavos,
        "image": {
            "assetPath": selection["imageAssetPath"],
            "sourceUrl": selection["imageUrl"],
            "sourceSha256": image_sha256,
            "localizedSha256": selection["localImageSha256"],
            "alt": f'Fotografía de referencia Protide Health de {selection["name"]} {selection["presentation"]}',
            "notice": "Imagen pública de referencia del catálogo fuente; no implica afiliación o autorización.",
        },
        "coa": {
            "url": selection["coaPdfUrl"],
            "assetPath": selection["coaAssetPath"],
            "sourcePageUrl": selection["coaPageUrl"],
            "sourceSha256": coa_sha256,
            "kind": "source-reference",
            "label": "COA de referencia publicado por Protide Health",
            "lot": selection["lot"],
            "lab": "Freedom Diagnostics",
            "methods": ["HPLC-MS", "identidad", "endotoxinas"],
            "purityPercent": selection["purityPercent"],
            "reportedDate": selection["reportedDate"],
            "sourceDocumentTitle": f'Certificate of Analysis — {selection["sourceTitle"]} — {selection["coaNumber"]}',
            "verifiedAt": verified_at,
        },
    }


def build_catalog() -> Dict[str, Any]:
    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    fx_mxn_ten_thousandths_per_usd = fetch_exchange_rate()
    protide_fx_mxn_ten_thousandths_per_usd = fetch_exchange_rate(
        SERMORELIN_FX_SOURCE_DATE,
        SERMORELIN_FX_MXN_TEN_THOUSANDTHS_PER_USD,
    )
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

        prices = product.get("prices", {})
        if prices.get("currency_code") != "USD" or prices.get("currency_minor_unit") != 2:
            raise RuntimeError(f"{selection['slug']}: expected USD with 2 minor units")
        if not str(prices.get("price", "")).isdigit() or int(prices["price"]) <= 0:
            raise RuntimeError(f"{selection['slug']}: missing or invalid public USD price")
        public_source_usd_cents = int(prices["price"])
        inventory_line = confirmed_inventory_line(selection["code"])
        source_usd_cents = inventory_line["unitUsdCents"] if inventory_line else public_source_usd_cents
        price_centavos = APPROVED_EXISTING_PUBLIC_PRICES_CENTAVOS[selection["code"]]
        if inventory_line:
            pricing_fx = (
                protide_fx_mxn_ten_thousandths_per_usd
                if selection["code"] == "KLOW-80"
                else fx_mxn_ten_thousandths_per_usd
            )
            computed_price = base_price_centavos(
                source_usd_cents, pricing_fx
            )
            if computed_price != price_centavos:
                raise RuntimeError(
                    f"{selection['slug']}: baseline FX no longer reproduces the approved public price"
                )
            profit_margin = profit_margin_centavos(
                source_usd_cents, price_centavos, pricing_fx
            )
            if not ACCEPTED_EFFECTIVE_MARGIN_CENTAVOS[0] <= profit_margin <= ACCEPTED_EFFECTIVE_MARGIN_CENTAVOS[1]:
                raise RuntimeError(f"{selection['slug']}: rounded effective margin MXN {profit_margin / 100:.2f} is outside guardrails")
        product_url = product.get("permalink")
        if not product_url or not product_url.startswith(f"https://{SOURCE_ORIGIN}/product/"):
            raise RuntimeError(f"{selection['slug']}: missing or unexpected product URL")
        coa = coa_metadata(
            product_url,
            selection["coa"],
            EXISTING_RECORD_VERIFIED_AT,
            selection.get("sourceCoaReviewPending", False),
        )
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
                "fetchedAt": EXISTING_RECORD_VERIFIED_AT,
            },
            "stockQuantity": inventory_line["quantity"] if inventory_line else 0,
            "purchaseEnabled": inventory_line is not None,
            "basePriceCentavos": price_centavos,
            "image": {
                "assetPath": f"assets/images/products/{image_filename}",
                "sourceUrl": source_image_url,
                "alt": f"Fotografía de referencia Ascension Peptides de {selection['name']} {selection['presentation']}",
                "notice": "Imagen pública de referencia del catálogo fuente; no implica afiliación o autorización.",
            },
            "coa": coa or {
                "url": None,
                "kind": "pending",
                "label": (
                    "COA de referencia pendiente de revisión por Mereon."
                    if selection.get("sourceCoaReviewPending")
                    else "COA pendiente de publicación por Ascension Peptides para esta referencia."
                ),
                "lot": None,
                "lab": None,
                "methods": [],
                "sourceDocumentTitle": None,
                "verifiedAt": EXISTING_RECORD_VERIFIED_AT,
            },
        }
        normalized.append(record)

    normalized.append(sermorelin_record(fetched_at, protide_fx_mxn_ten_thousandths_per_usd))
    normalized.extend(
        protide_record(selection, fetched_at, protide_fx_mxn_ten_thousandths_per_usd)
        for selection in PROTIDE_SELECTIONS
    )

    return {
        "schemaVersion": 3,
        "generatedAt": fetched_at,
        "sourceNotice": "Los datos públicos del catálogo del proveedor son una referencia de investigación. No se implica ninguna relación de reventa, afiliación, autorización o distribución oficial.",
        "pricingAssumptions": {
            "fxMxnTenThousandthsPerUsd": fx_mxn_ten_thousandths_per_usd,
            "fxSourceUrl": FX_SOURCE_URL,
            "fxSourceDate": FX_SOURCE_DATE,
            "ivaIncludedBasisPoints": IVA_BPS,
            "cleanPriceIncrementCentavos": CLEAN_INCREMENT_CENTAVOS,
            "rule": "Los precios públicos incluyen IVA y se redondean a MXN 50. El pago solo agrega envío y desglosa el IVA incluido con fines informativos.",
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
        print(f"Catalog validated: {len(catalog['products'])} products; available={available}; coa_pending={pending}; evaluation={evaluation}")
        print(f"Source: {API_URL}")
        print("Output: check-only" if args.check else f"Output: {args.output}")
        return 0
    except Exception as exc:
        print(f"ERROR: catalog import failed closed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
