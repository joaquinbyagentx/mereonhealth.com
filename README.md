# Mereon

Mereon is a static, Spanish-language conversational-commerce demonstration created by ByAgentX. It is not a pharmacy, active store, medical provider, prescriber, or payment processor; all programs and prices are illustrative.

## Source lineage

The site was extracted from the tracked production files under `projects/farmacia/` at ByAgentX source commit `3835335cee4eb80af917fb6b14c26312d5b5b69b`. The files were moved to this repository root and adapted only for root-domain metadata and GitHub Pages deployment.

## Deployment

GitHub Pages publishes the `main` branch from the repository root. `CNAME` configures the custom domain `mereonhealth.com`. The site is dependency-free and can be previewed locally with any static HTTP server, for example:

```sh
python3 -m http.server 8000
```
