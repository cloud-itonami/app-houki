# houki kotoba

Phase E Option B reference implementation of houki (法規 / private authority intelligence agent) on the etzhayyim substrate.

Per [ADR-2605203000](../../../90-docs/adr/2605203000-kotoba-write-target-options.md), houki migrates from vendor's `createKyselyDb` pattern (RW direct write) to **Option B** — PDS XRPC writes via `@etzhayyim/sdk e.write()`.

Coverage: **8 of 8 (100%) canonical** houki commands ported + 1 helper (registerRuleBundle) = **9 total**.

| Tier | Commands | Slice |
|---|---|---|
| Document | ingestDocument, ingestText, getDocument, listDocuments | 1 |
| Rules + Bundle | extractRules, listRules, getRuleBundle, listRuleBundles, registerRuleBundle | **2** |

All 8 canonical houki commands now have kotoba reference impl. Wire-up
to a Worker / LangServer pod XRPC handler is the next operator task.

## What houki does

houki handles the **`private`** kind of the authority chain — corporate legal docs (ToS / privacy policies / NDA / contracts / SLA). Sibling authority apps own their respective kinds:

| Authority kind | Owner actor |
|---|---|
| **private** | **houki** (this app) |
| states (主権法) | jurisdiction-state actor |
| treaty (条約) | treaty-actor |
| religious (宗教法) | religious-canon actor |
| customary (慣習法) | customary-law actor |
| tradition (家訓/文化) | tradition-actor |
| ethics (職業倫理) | ethics-actor |
| industry-standard | industry-spec actor |

See `90-docs/260323-authority-chain-compliance-design.md` for the full Authority-Chain composition design.

## Authority-chain DIDs

```
did:web:houki.etzhayyim.com                              — controller
did:web:houki.etzhayyim.com:document:{docId-slug}        — this slice (LegalDocument)
did:web:houki.etzhayyim.com:rule:{docId}-{ruleSeq}       — ExtractedRule (future)
did:web:houki.etzhayyim.com:rulebundle:{bundleId-slug}   — RuleBundle (future)
```

## Pattern translation (Option B)

| Vendor (`houki.etzhayyim.com`) | etzhayyim (this PR) |
|---|---|
| `const db = createKyselyDb();` | `import type { Etzhayyim } from "@etzhayyim/sdk"` |
| `db.insertInto("vertex_houki_document").values({...}).execute()` | `e.write({ collection: "com.etzhayyim.houki.document", record, rkey })` |
| `db.selectFrom("vertex_houki_document").where("doc_id","=",id).execute()` | `e.read({ collection, rkey: \`document-${idSlug(id)}\` })` |

## Usage

```ts
import { Etzhayyim } from "@etzhayyim/sdk";
import { ingestDocument, ingestText } from "@etzhayyim/houki-kotoba";

const e = new Etzhayyim({
  did: "did:web:houki.etzhayyim.com",
  pdsUrl: "https://pds.etzhayyim.com",
  l2RpcUrl: "https://mainnet.base.org",
});

// Ingest from URL (caller has already fetched the body)
const r = await ingestDocument(e, {
  docId: "openai-tos-2026-05",
  url: "https://openai.com/policies/terms-of-use",
  kind: "terms-of-service",
  publisherName: "OpenAI, OpCo, LLC",
  language: "en",
  contentSha256: "a3f5e8b7c2d1...",   // 64-hex sha256 of fetched body
  contentCid: "bafybeih...",          // optional CIDv1 from IPFS pin
});
```

## Why Option B for houki

Per ADR-2605203000 Phase E decision matrix:
- **Catalog**: structured document + extracted rule metadata + IPFS-backed blob
- **Write cadence**: per-ingest (low rate)
- **Query pattern**: by docId / publisher / kind (rkey-direct or post-fetch filter)

Option A (vendor RW mirror) rejected — ADR-2605172000 mandates kotoba.

## Sibling reference impls

| Actor | Coverage | Status |
|---|---|---|
| hanrei | 31/31 (100%) | complete |
| ipaddress | 37/37 (100%) | complete |
| sbom | 17/N (canonical 4/4) | canonical complete |
| kiyo | 12/12 (100%) | complete |
| ki | 4/4 (100%) | complete |
| otakiage | 13 (10/10 canonical) | complete |
| **houki** | **4/8** | active |
