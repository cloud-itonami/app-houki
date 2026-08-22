# Operator quickstart

Every command below was walked on 2026-08-23 from a clean checkout of
`main` at `5b04279`; the output pasted here is the output it produced. If a
step does not reproduce, that is a finding — say so rather than adjusting the
doc to match.

One step needs npm and does not work under every `~/.npmrc`; see
[a note on npm](#a-note-on-npm) before you start.

What you can reach from here: the `kotoba/` reference implementation — the
record shapes, the identity rule, and the validators — runs entirely offline
against a mock substrate. **The Worker is not exercised by any of this**: the
XRPC adapter cannot be installed as shipped and does not parse (§6). Nothing
in this tree fetches a document, hashes one, or extracts a rule; see
`README.md` for what the slice actually does.

---

## 1. Read the guards without installing anything

No toolchain needed. Every error name the document tier can answer, and
where it is raised:

```bash
grep -n 'invalidContentSha256\|missingRequiredFields\|alreadyExists' kotoba/src/documentRegistry.ts
```

```
54:    return { status: "rejected", error: "missingRequiredFields" };
57:    return { status: "rejected", error: "invalidContentSha256" };
65:      status: "alreadyExists",
104:    return { status: "rejected", error: "missingRequiredFields" };
107:    return { status: "rejected", error: "invalidContentSha256" };
115:      status: "alreadyExists",
```

Lines 54–65 are `ingestDocument`, 104–115 are `ingestText`; the two are the
same function with `source: "url"` vs `"text"` and `sourceRef` = the URL vs
the hash. Neither stores the body it was given.

The rule tier:

```bash
grep -n 'documentNotFound\|reason: "\|missingRequiredFields' kotoba/src/rules.ts
```

```
66:    return { status: "rejected", error: "missingRequiredFields" };
76:    return { status: "rejected", error: "documentNotFound" };
84:      skipped.push({ ruleSeq: r.ruleSeq ?? -1, reason: "missingFields" });
92:      skipped.push({ ruleSeq: r.ruleSeq, reason: "alreadyExists" });
234:    return { status: "rejected" as const, error: "missingRequiredFields" };
```

Lines 66–92 are `extractRules` (whole-call rejection, then per-rule skips);
234 is `registerRuleBundle`. Nothing in §4 exercises any of these five
lines — the suite imports only the document tier.

## 2. Confirm the prose disagrees with the tree

This is the fastest way to see the findings recorded in `README.md`, and it
needs no install.

**2a. `CLAUDE.md`'s vocabulary is absent from the source.** Twelve
identifiers it uses as the app's commands, channels, stores and pipeline
stages:

```bash
for w in ingest-document refresh-document WRecord WSend houki-feed houki-alerts \
         houki-bundles yata completer stripHTML h0uk1001 murakumo; do
  printf '%-18s %s\n' "$w" \
    "$(grep -rc -- "$w" kotoba/src xrpc-adapter/src | awk -F: '{s+=$2} END{print s}')"
done
```

```
ingest-document    0
refresh-document   0
WRecord            0
WSend              0
houki-feed         0
houki-alerts       0
houki-bundles      0
yata               0
completer          0
stripHTML          0
h0uk1001           0
murakumo           0
```

**2b. Two DIDs for one actor:**

```bash
grep -ohE 'did:web:[a-z0-9.-]+' CLAUDE.md kotoba/src/types.ts xrpc-adapter/wrangler.jsonc | sort | uniq -c
```

```
   1 did:web:houki-h0uk1001.etzhayyim.com
   6 did:web:houki.etzhayyim.com
```

The `1` is `CLAUDE.md`. Everything that runs uses the other one.

**2c. Three coverage claims, two files:**

```bash
grep -nE '[0-9] of 8|[0-9]/8' kotoba/README.md kotoba/src/index.ts
```

```
kotoba/README.md:7:Coverage: **8 of 8 (100%) canonical** houki commands ported + 1 helper (registerRuleBundle) = **9 total**.
kotoba/README.md:94:| **houki** | **4/8** | active |
kotoba/src/index.ts:8: * Slice 1: 4 of 8 lexicons ported.
```

Nine functions are exported (`grep -cE '^\s+[a-zA-Z]+,$' kotoba/src/index.ts`
→ `9`), so line 7 is the current one.

**2d. The adapter does not parse.** A global `tsc` is enough; no
dependencies are needed to reach a syntax error, because TypeScript stops
there:

```bash
tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
    --skipLibCheck xrpc-adapter/src/index.ts; echo "exit=$?"
sed -n 131,136p xrpc-adapter/src/index.ts
```

```
xrpc-adapter/src/index.ts(136,6): error TS1005: ',' expected.
exit=2
    const e = createAuthedEtzhayyim({
      env: {
      ACTOR_DID: env.ACTOR_DID,
      PDS_URL: env.PDS_URL,
      L2_RPC_URL: env.L2_RPC_URL,
    });
```

(`tsc` 5.9.2.) The `env: {` on line 132 is never closed. One error, and it
is the only one `tsc` can report before the file parses — what the semantic
pass would say is unmeasured.

**2e. The bearer token is extracted and dropped:**

```bash
grep -c bearerToken xrpc-adapter/src/index.ts
```

```
1
```

One occurrence is the declaration (`const bearerToken = extractBearerToken(req);`,
line 130). It is passed nowhere.

**2f. The adapter README's query parameters are not the functions' inputs:**

```bash
grep -oE '\?[a-zA-Z]+=' xrpc-adapter/README.md | tr -d '?=' | sort -u | tr '\n' ' '; echo
grep -oE '^\s+[a-zA-Z]+\??:' kotoba/src/types.ts | tr -d ' ?:' | sort -u \
  | grep -E '^(authorDid|bundleId|documentId|registrarDid|ruleSeq)$'
```

```
authorDid bundleId documentId registrarDid ruleSeq
bundleId
ruleSeq
```

First line: the five names the README documents. Second: which of them are
a field of *any* input type. `ruleSeq` is a field of `ExtractRuleInput` (an
element of the `extractRules` POST body), not a `listRules` filter; so only
`bundleId` is right for the endpoint it is listed under. `documentId` should
be `docId`; `authorDid` and `registrarDid` have no counterpart (the filter
both lists support is `publisherDid`).

## 3. The identity rule, without installing anything

`documentRkey` and `documentDid` are pure; `tsc` can transpile `types.ts`
alone and node can call it:

```bash
tsc kotoba/src/types.ts --outDir /tmp/houki-types --module esnext --target es2022
node --input-type=module -e '
import { documentRkey, documentDid } from "/tmp/houki-types/types.js";
for (const id of ["tos-2025", "TOS 2025", "tos_2025", "ToS/2025"])
  console.log(JSON.stringify(id).padEnd(12), documentRkey(id), documentDid(id));'
```

```
"tos-2025"   document-tos-2025 did:web:houki.etzhayyim.com:document:tos-2025
"TOS 2025"   document-tos-2025 did:web:houki.etzhayyim.com:document:tos-2025
"tos_2025"   document-tos-2025 did:web:houki.etzhayyim.com:document:tos-2025
"ToS/2025"   document-tos-2025 did:web:houki.etzhayyim.com:document:tos-2025
```

Four spellings, one record. The second ingest of any of them answers
`alreadyExists` and points at the first. The `docId` *stored* is whatever the
first caller spelled. The suite's "is idempotent on docId" test (§4) re-sends
the identical string, so this collapse is observed here and in §5, and
nowhere in the tests.

Related, and also visible without a toolchain — the fixture hash the whole
suite uses is SHA-256 of the empty string:

```bash
printf '' | shasum -a 256
grep -n 'validSha256 =' -A1 kotoba/test/houki.test.ts | tail -1
```

```
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  -
14-    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
```

`ingestText` is called with that hash and the text `"This is the full
document text"` and answers `registered`. The validator checks the *shape*
of `contentSha256` (64 hex), not that it hashes anything.

## 4. Install and run the suite

`kotoba/` has two git dependencies (`@etzhayyim/sdk`, `@etzhayyim/sdk-mock`,
both pinned to a commit) and vitest. npm clones and `prepare`s the git ones,
which is where all the time goes.

```bash
cd kotoba
printf 'strict-ssl=false\n' > /tmp/clean-npmrc      # why: "A note on npm" below
npm install --userconfig /tmp/clean-npmrc
```

```
added 134 packages, and audited 135 packages in 26m
```

That was **the second attempt**. The first, twenty minutes earlier, died at
`ENOSPC: no space left on device` inside the nested prepare of
`@etzhayyim/sdk` — the volume had 3.4 GiB free at the start and npm's
git-clone scratch (`~/.npm/_cacache/tmp`, ~313 MiB per `@etzhayyim/sdk`
prepare) plus four abandoned clones of the same package from a week earlier
ate it. npm rolled back cleanly (no `node_modules`, no lockfile). After
removing the abandoned scratch (8.8 GiB free) the second attempt went through
in 26 minutes at load average 47→27, leaving 289 MiB in `node_modules`. The
elapsed time is dominated by preparing `@etzhayyim/sdk` (its `prepare` runs
`tsc`); on a quiet machine expect less, but not seconds.

```bash
npm ls --depth=0
```

```
@etzhayyim/houki-kotoba@0.1.0 /private/tmp/maturity-app-houki/kotoba
+-- @etzhayyim/sdk-mock@0.1.0 (git+ssh://git@github.com/etzhayyim/com-etzhayyim-sdk-mock.git#c857ff9be5310bf433bfe1e8d3c0f677e213d667)
+-- @etzhayyim/sdk@0.1.0-alpha (git+ssh://git@github.com/etzhayyim/com-etzhayyim-sdk.git#12314a0cc5ac2feb49dd9789d5c002398acb6988)
`-- vitest@4.1.11
```

Both sdk pins resolved to the exact commits `package.json` names. (The
`etzhayyim/com-etzhayyim-*` repositories have since been renamed to
`kotoba-lang/sdk` / `kotoba-lang/sdk-mock`; GitHub redirects the old URLs,
which is why the pins still resolve.)

`npm install` leaves `node_modules/` and `package-lock.json` **untracked** —
there is no `.gitignore` anywhere in this repo. Do not commit either; do not
add a `.gitignore` in a docs change.

```bash
npm test
```

```
 RUN  v4.1.11 /private/tmp/maturity-app-houki/kotoba

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Duration  1.26s (transform 227ms, setup 0ms, import 302ms, tests 70ms, environment 0ms)
```

Eighteen, all in `test/houki.test.ts`, all on the document tier. To run one:

```bash
./node_modules/.bin/vitest run -t 'idempotent'
```

```
 Test Files  1 passed (1)
      Tests  1 passed | 17 skipped (18)
```

(`./node_modules/.bin/vitest` rather than `npx vitest`: on this machine's
npm 11.16 `npx` mis-parses flags after the package name; the direct path
avoids the question.)

There is no build step and no `tsconfig.json`:

```bash
npm run build
```

```
npm error Missing script: "build"
```

`package.json` declares `"main": "src/index.ts"` and only a `test` script;
vitest transpiles `src/` on the fly. To typecheck anyway, a global `tsc`
(5.9.2 here) with the resolver pointed at `kotoba/node_modules`:

```bash
cd ..   # repo root
tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler \
    --skipLibCheck kotoba/src/index.ts; echo "exit=$?"
```

```
exit=0
```

The source is clean under `--strict`. The **test file is not** — the same
command on `kotoba/test/houki.test.ts` exits 2 with three `TS2345` errors
(lines 79, 83, 96): each is an object literal first bound to a `const` and
then passed to `ingestDocument`, so `kind` widens to `string` and no longer
satisfies `DocumentKind`. The suite is green because vitest does not
typecheck. Not fixed here.

## 5. Drive the rule tier by hand

Five of nine functions have no test (`README.md`). Their guards can be
observed with a throwaway test file — vitest is the only way to run the
slice, since `src/` imports `./types.js` (a `.ts` file) and node's own type
stripping does not remap that. Write this as `kotoba/test/_probe.test.ts`,
run it, **delete it** (nothing here should be committed):

```ts
import { it } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  ingestDocument, getDocument, extractRules,
  registerRuleBundle, getRuleBundle,
} from "../src/index.js";

const sha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const show = (label: string, v: unknown) => console.log(label.padEnd(34), JSON.stringify(v));

it("probe", async () => {
  const e: any = new MockEtzhayyim({ did: "did:web:houki.etzhayyim.com" });
  show("extractRules / no such doc", await extractRules(e, { docId: "nope", rules: [{ ruleSeq: 1, category: "consent", summary: "x" }] }));
  show("ingestDocument tos-2025", (await ingestDocument(e, { docId: "tos-2025", url: "https://example.com/tos", kind: "terms-of-service", contentSha256: sha })).status);
  show("ingestDocument 'TOS 2025'", await ingestDocument(e, { docId: "TOS 2025", url: "https://example.com/other", kind: "nda", contentSha256: sha }));
  const r = await extractRules(e, { docId: "tos-2025", runId: "run-1", rules: [
    { ruleSeq: 1, category: "consent", summary: "user consents" },
    { ruleSeq: 2, category: "liability", summary: "" },
    { ruleSeq: 0, category: "minors", summary: "seq zero" },
  ]});
  show("extractRules / 3 rules", { status: r.status, inserted: r.inserted?.map(i => i.ruleSeq), skipped: r.skipped });
  show("extractRules / same rule again", (await extractRules(e, { docId: "tos-2025", rules: [{ ruleSeq: 1, category: "consent", summary: "again" }] })).skipped);
  show("getDocument.lastExtractionId", (await getDocument(e, { docId: "tos-2025" })).document?.lastExtractionId);
  show("registerRuleBundle / no DIDs", await registerRuleBundle(e, { bundleId: "b1", name: "B", categories: [], ruleDids: [] }));
  show("registerRuleBundle / bogus DIDs", (await registerRuleBundle(e, { bundleId: "b1", name: "B", categories: ["consent"], ruleDids: ["did:web:nowhere:rule:none"] })).status);
  show("registerRuleBundle / again", (await registerRuleBundle(e, { bundleId: "b1", name: "B", categories: [], ruleDids: ["x"] })).status);
  show("getRuleBundle / missing", await getRuleBundle(e, { bundleId: "zzz" }));
});
```

```bash
cd kotoba
./node_modules/.bin/vitest run --disableConsoleIntercept test/_probe.test.ts
rm test/_probe.test.ts
```

(`--disableConsoleIntercept` because vitest 4 otherwise keeps a passing
test's `console.log` to itself — the first run of this probe printed nothing
but `1 passed`.)

```
extractRules / no such doc         {"status":"rejected","error":"documentNotFound"}
ingestDocument tos-2025            "registered"
ingestDocument 'TOS 2025'          {"status":"alreadyExists","documentUri":"at://did:web:houki.etzhayyim.com/com.etzhayyim.houki.document/document-tos-2025","did":"did:web:houki.etzhayyim.com:document:tos-2025","docId":"TOS 2025"}
extractRules / 3 rules             {"status":"ok","inserted":[1],"skipped":[{"ruleSeq":2,"reason":"missingFields"},{"ruleSeq":0,"reason":"missingFields"}]}
extractRules / same rule again     [{"ruleSeq":1,"reason":"alreadyExists"}]
getDocument.lastExtractionId       "run-1"
registerRuleBundle / no DIDs       {"status":"rejected","error":"missingRequiredFields"}
registerRuleBundle / bogus DIDs    "registered"
registerRuleBundle / again         "alreadyExists"
getRuleBundle / missing            {"error":"notFound"}
```

Reading down: the document check fires; the §3 slug collapse is live (a
`nda` under `TOS 2025` is answered with the `terms-of-service` record's URI,
and the reply echoes the *caller's* spelling); an empty `summary` and a
`ruleSeq` of 0 are skipped as `missingFields` while the valid rule lands;
re-sending it is `alreadyExists`; the parent document picked up
`lastExtractionId` because a `runId` was given and one rule was inserted; a
bundle with no DIDs is refused but a bundle of a DID that exists nowhere is
`registered`; and a missing bundle is `{ error }` with no `status` — which
the adapter would serve as HTTP 200.

## 6. The adapter cannot be installed, and does not parse

Two independent reasons, measured separately. The parse error is §2d. The
install:

```bash
cd ../xrpc-adapter      # from kotoba/
grep -n 'workspace' package.json
```

```
13:    "@etzhayyim/houki-kotoba": "workspace:*"
```

`workspace:` is a pnpm/yarn protocol; there is no workspace root
(`pnpm-workspace.yaml`, root `package.json` with `workspaces`) in this repo,
and npm rejects the protocol outright. Measured in an isolated directory
with only that dependency:

```
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

Against the real `package.json` the rejection is **not** immediate: npm
starts preparing the two git dependencies (`@etzhayyim/sdk`,
`@etzhayyim/sdk-auth`) first, and a run bounded to 120 s was still inside
that when it was killed (exit 124). So "does it install" took a two-minute
wait to answer *not yet*, and the `EUNSUPPORTEDPROTOCOL` from the minimal
case is the actual answer. Neither `wrangler dev` nor `wrangler deploy` was
attempted.

## A note on npm

If `npm install` fails like this:

```
npm error code 1
npm error git dep preparation failed
npm error npm error code EALLOWSCRIPTS
npm error npm error --allow-scripts is not allowed in project-scoped installs.
```

…the cause is an `allow-scripts[]` entry in your **user-level** `~/.npmrc`,
not the npm version and not this repo. npm propagates the entry into the
nested install it runs to prepare a git dependency, and that nested install
rejects it as project-scoped. This machine's `~/.npmrc` has such an entry,
and the install in §4 was run with a user config that does not:

```bash
printf 'strict-ssl=false\n' > /tmp/clean-npmrc
npm install --userconfig /tmp/clean-npmrc
```

The full measurement (three user-config variants, npm 11.16.0) is in
`cloud-itonami/app-scheduler/docs/operator-quickstart.md` § "A note on
npm"; the failure mode is the same package pair (`@etzhayyim/sdk` +
`@etzhayyim/sdk-mock`) and was not re-measured here.

## What is not covered here

Deliberately, because none of it was walked:

- **The XRPC adapter as a running Worker.** It cannot be installed (§6)
  and does not parse (§2d), so `wrangler dev` / `wrangler deploy` were not
  attempted. `wrangler.jsonc` routes `houki.etzhayyim.com/xrpc/*` on zone
  `etzhayyim.com`; whether anything is currently serving that route was not
  checked from here.
- **Anything against a real PDS.** Every call in §4 goes to
  `MockEtzhayyim`. `PDS_URL` / `L2_RPC_URL` in `wrangler.jsonc` were not
  contacted.
- **The rule tier at runtime.** `extractRules`, `listRules`,
  `getRuleBundle`, `listRuleBundles`, `registerRuleBundle` have no tests
  and were not driven by hand. §1 shows their guards in source; that they
  fire is unmeasured.
- **Document fetching, hashing, LLM extraction, drift detection.** Not
  because they were skipped but because the tree contains none of them
  (`README.md`). The `contentSha256` a caller passes is the caller's claim.
