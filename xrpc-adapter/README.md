# houki XRPC Adapter

CF Worker that exposes the 9 kotoba commands as XRPC endpoints.

## Endpoints

### Document Registry (Slice 1)
- `POST /xrpc/com.etzhayyim.houki.ingestDocument` — ingest document
- `POST /xrpc/com.etzhayyim.houki.ingestText` — ingest text snippet
- `GET /xrpc/com.etzhayyim.houki.getDocument?documentId=...` — fetch document + metadata
- `GET /xrpc/com.etzhayyim.houki.listDocuments?authorDid=...` — paginated documents

### Rules & Bundles (Slice 2)
- `POST /xrpc/com.etzhayyim.houki.extractRules` — LLM-extract compliance rules
- `GET /xrpc/com.etzhayyim.houki.listRules?ruleSeq=...` — paginated rules
- `GET /xrpc/com.etzhayyim.houki.getRuleBundle?bundleId=...` — fetch bundle
- `GET /xrpc/com.etzhayyim.houki.listRuleBundles?registrarDid=...` — paginated bundles
- `POST /xrpc/com.etzhayyim.houki.registerRuleBundle` — cross-actor bundle registration

## Setup

```bash
cd 60-apps/etzhayyim-project-houki/xrpc-adapter
npm install
```

## Development

```bash
npm run dev
# Worker listens on http://localhost:8787
```

## Deploy

```bash
wrangler deploy
# Deploys to houki.etzhayyim.com/xrpc/*
```

See ADR-2605210000 for design context.
