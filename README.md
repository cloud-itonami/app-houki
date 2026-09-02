# app-houki

**`houki.etzhayyim.com` — 法規: the *private-authority* plane of the
authority chain. A registry of corporate legal documents (ToS, privacy
policies, NDAs, contracts, SLAs), the compliance rules extracted from them,
and the bundles those rules are grouped into for other actors to consume.**

Two things live here, and they are not the same size. Read the second
section before trusting any prose elsewhere in the tree.

| plane | path | what it is | substrate |
|---|---|---|---|
| **kotoba slice** | `kotoba/` | Reference implementation of the data model as 9 TypeScript functions over `@etzhayyim/sdk` (`e.write` / `e.read` against a PDS). Tested offline against `@etzhayyim/sdk-mock` | AT Protocol records, collections `com.etzhayyim.houki.{document,rule,ruleBundle}` |
| **XRPC adapter** | `xrpc-adapter/` | A Cloudflare Worker that maps `/xrpc/com.etzhayyim.houki.*` onto those 9 functions, one route per function. **Does not compile as shipped** (one unclosed brace — see below) | whatever the kotoba slice uses |

There is no appview and no engine in this repo. Nothing here fetches a URL,
strips HTML, calls an LLM, or detects drift — every one of those steps is
*described* (`CLAUDE.md`, `kotoba/README.md`) and none is implemented. The
kotoba slice **persists a result someone else computed**: the caller passes
a `contentSha256` and (optionally) a `contentCid`, and the slice records
them. It does not read the document body, does not hash it, and does not
store it.

What the slice does enforce, as of this tree (`kotoba/src/documentRegistry.ts`,
`kotoba/src/rules.ts`):

- `ingestDocument` / `ingestText` refuse a missing `docId` / `url`|`text` /
  `kind` / `contentSha256` (`missingRequiredFields`) and a `contentSha256`
  that is not 64 hex digits (`invalidContentSha256`). The hash is
  lower-cased and stored; **whether it is the hash of anything is not
  checked** — the suite's own fixture hash is SHA-256 of the empty string,
  used against non-empty text, and passes.
- A second ingest under the same `docId` answers `alreadyExists` with the
  first record's URI. Identity is the *slug* of the `docId`
  (`idSlug`: lower-case, each non-`[a-z0-9]` character → `-`), so `tos-2025`,
  `TOS 2025`, `tos_2025` and `ToS/2025` are one document
  (`docs/operator-quickstart.md` §2).
- `extractRules` refuses rules for a `docId` that has no document
  (`documentNotFound`), skips per-rule entries missing `ruleSeq ≥ 1` /
  `summary` / `category` (`missingFields`) or already present
  (`alreadyExists`), and — only when a `runId` was given and at least one
  rule was inserted — rewrites the parent document with
  `lastExtractionId`.
- `registerRuleBundle` refuses an empty `ruleDids` and a duplicate
  `bundleId`. It does **not** check that the DIDs it is handed exist.
- `getDocument` / `getRuleBundle` answer `{ error: "notFound" }` with no
  `status` field — which the adapter's `mapStatus` turns into **HTTP 200**,
  since it only keys on `status` (§"Read this before…").

## Layout

Sixteen tracked files before this README and `docs/operator-quickstart.md`:

```
kotoba/                          9 functions, 18 tests (document tier only — see below)
  src/types.ts                   records, DIDs, rkeys, the kind/category unions, idSlug
  src/documentRegistry.ts        ingestDocument ingestText getDocument listDocuments
  src/rules.ts                   extractRules listRules getRuleBundle listRuleBundles
                                 registerRuleBundle
  src/index.ts                   barrel (its docstring still says "4 of 8")
  test/houki.test.ts             imports the four document functions and nothing else
  package.json                   scripts: test only. main = src/index.ts (no build, no tsconfig)
  vitest.config.ts
xrpc-adapter/                    Cloudflare Worker, 9 routes, route = houki.etzhayyim.com/xrpc/*
  src/index.ts                   syntax error at line 136 (TS1005) — see below
  wrangler.jsonc                 name houki-xrpc-adapter, vars ACTOR_DID / PDS_URL / L2_RPC_URL
CLAUDE.md                        describes a different, earlier design (see below)
README.edn                       {:kind :app}
migration.edn                    provenance: etzhayyim/root 60-apps/etzhayyim-project-houki @ afe5f1d
```

## Read this before trusting the rest of the tree

This repo was extracted from `etzhayyim/root` (`60-apps/etzhayyim-project-houki`,
see `migration.edn`) and **most of the prose in it describes either the
pre-extraction layout or a design this tree never contained.** Every row
below was measured on 2026-08-23 against commit `5b04279`; the commands are
in `docs/operator-quickstart.md` §1–§3; §5 drives the untested rule tier by hand.

| What a reader would conclude | What the tree actually contains |
|---|---|
| `CLAUDE.md`: nine hyphenated commands (`ingest-document` … `refresh-document` with drift detection), three "W Protocol" channels (`houki-feed` / `houki-alerts` / `houki-bundles`), `WRecord` writes to `yata`, cross-actor calls to `completer`, an ingestion pipeline `HTTP GET → Browser WIT fallback → stripHTML → LLM (murakumo)` | **None of those identifiers appear anywhere in the source** (`grep -c` = 0 for all twelve probed). The functions are camelCase (`ingestDocument` …), there is no `refreshDocument`, no channel, no fetch, no HTML stripping, no LLM call |
| `CLAUDE.md`: bot DID `did:web:houki-h0uk1001.etzhayyim.com`, nanoid `h0uk1001` | The source, `wrangler.jsonc`, and every record DID use `did:web:houki.etzhayyim.com`. `h0uk1001` occurs only in `CLAUDE.md` |
| `kotoba/README.md` line 7: "**8 of 8 (100%) canonical** houki commands ported + 1 helper = 9 total" | 9 functions are exported, so this line is right — but the same file's sibling table (line 94) says **`houki 4/8 active`**, and `kotoba/src/index.ts` line 8 says "Slice 1: 4 of 8 lexicons ported". Three statements of coverage in two files; one is current |
| `kotoba/README.md`: "Wire-up to a Worker / LangServer pod XRPC handler is the next operator task" | The Worker exists (`xrpc-adapter/`) and routes all 9 functions. It also does not parse: `src/index.ts:132` opens `env: {` and never closes it; `tsc` reports exactly one error, `TS1005: ',' expected` at 136:6. `wrangler deploy` cannot have succeeded from this tree |
| `xrpc-adapter/src/index.ts`: "Instantiates the Etzhayyim SDK from env bindings (PDS_URL + session)" | `extractBearerToken(req)` is called and its result is never used (`bearerToken`: 1 occurrence, the declaration). Even once the brace is fixed, no session reaches the SDK |
| `xrpc-adapter/README.md` endpoint list: `getDocument?documentId=`, `listDocuments?authorDid=`, `listRules?ruleSeq=`, `listRuleBundles?registrarDid=` | The input types read `docId`, `publisherDid`, *(no `ruleSeq` on `ListRulesInput`)*, `publisherDid`. Of the five parameter names the README gives, only `bundleId` is a field of the input type of the endpoint it is listed under (`ruleSeq` exists, but on `ExtractRuleInput` — a POST body element — not as a `listRules` filter). The adapter also coerces `offset` and `ruleSeq` on GET; no GET input type has either |
| `xrpc-adapter/README.md` setup: `cd 60-apps/etzhayyim-project-houki/xrpc-adapter` | No `60-apps/` here; the path resolved inside `etzhayyim/root` |
| `xrpc-adapter/package.json` can be installed with `npm install` | It declares `"@etzhayyim/houki-kotoba": "workspace:*"`, a pnpm/yarn workspace protocol; there is no workspace root in this repo (`docs/operator-quickstart.md` §6) |
| `kotoba/README.md` links `../../../90-docs/adr/2605203000-…` and `90-docs/260323-authority-chain-compliance-design.md` | Neither path exists from this repo |
| `kotoba/README.md` usage example passes `contentSha256: "a3f5e8b7c2d1..."` | As written that is rejected (`invalidContentSha256` — not 64 hex). The comment beside it says what a real value looks like |
| `IngestDocumentInput.fetchedContent` — "Pre-fetched body content (caller fetched the URL)" | Declared in `types.ts`, read nowhere (`grep -c fetchedContent documentRegistry.ts` = 0). `ingestText`'s `text` is likewise checked for presence and then dropped. **No document body is ever persisted by this slice** |
| `migration.edn`: `:tracked-files 14` | 16 tracked before this README; the two extra are the `:allowed-additions` (`README.edn`, `migration.edn`) — consistent, it counts the *source* tree |

**None of these are fixed here, on purpose.** The one-brace fix is trivial
but it is not the decision — the decision is whether the adapter is the
product surface (in which case the README's parameter names, the unused
bearer token, and the `workspace:*` dependency all need the same owner), or
whether the kotoba slice is a library the LangServer pod consumes directly
(in which case the adapter is dead weight). This tree does not settle that,
so the findings are recorded rather than patched, and a green test suite is
not mistaken for a deployable Worker.

### What the test suite does and does not cover

`kotoba/test/houki.test.ts` has 18 tests, all on the **document tier**
(`ingestDocument`, `ingestText`, `getDocument`, `listDocuments`) — the only
four names it imports. `extractRules`, `listRules`, `getRuleBundle`,
`listRuleBundles` and `registerRuleBundle` have no test. Five of nine
functions are untested, and every rule-tier guard listed at the top of this
file (`documentNotFound`, per-rule `missingFields` / `alreadyExists`, the
`lastExtractionId` write-back, `registerRuleBundle`'s duplicate check) is
among them. Each of those guards was driven once by hand with a throwaway
probe (`docs/operator-quickstart.md` §5) and behaved as the source reads;
that is an observation of this commit, not a test anyone will re-run.

### What `test/cross_plane_test.cljs` covers instead

Every row of the table above was measured once, by hand, against `5b04279`.
Prose does not notice when it stops being true, and nothing in this repo read
two files together — `kotoba/test/houki.test.ts` imports four functions from
one module and cannot see the adapter, the READMEs or `CLAUDE.md`; the adapter
has no test at all.

`test/cross_plane_test.cljs` (nbb, no install, no network) holds **17 of those
facts** as checks: the nine exports and the nine routes agreeing; the unclosed
brace; the four operations the suite imports and the five it does not; the four
README parameter names that are not fields of the input types their endpoints
use; the two coerced query fields no GET input declares; the unused
`bearerToken`; the dropped `fetchedContent`; the statusless `notFound` returns
that `mapStatus` answers 200; the twelve `CLAUDE.md` identifiers and its bot
DID, absent from the source; the three coverage claims; and the `workspace:*`
dependency with no workspace root.

```bash
nbb test/cross_plane_test.cljs      # 0 = all 17 hold, 1 = a fact moved, 2 = REFUSED
```

Most of these pin a *disagreement*, so **a red check can mean repair**: the
message says which reading applies and which prose has to move with it. Exit 2
is separate on purpose — it means an anchor or a file this reads is gone, so
nothing was measured, and a checker blind to its input must not answer clean.

Eighteen mutations (`scripts/maturity-loop/mutations.edn` in the superproject,
suite `app-houki`) were each applied to this tree and seen to go red — thirteen
at exit 1 and five at exit 2 — before any of this was committed.

The five untested operations above are still untested. This suite reads the
source; it does not execute it.

## Getting started

`docs/operator-quickstart.md` — every command there was walked, and the output
pasted into it is the output it produced.
