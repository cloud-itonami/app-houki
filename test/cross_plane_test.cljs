#!/usr/bin/env nbb
;; cross_plane_test.cljs — the two planes' declarative surfaces, and the prose
;; that describes them, checked against each other.
;;
;; ## Why this lives at the repo root and not inside a plane
;;
;; README.md's central claim is that "most of the prose in it describes either
;; the pre-extraction layout or a design this tree never contained", and it
;; spends a fifteen-row table saying so. Every one of those rows is currently
;; prose measured once, by hand, on 2026-08-23 against commit 5b04279.
;; **Prose does not notice when it stops being true.** Nothing in this repo
;; reads `kotoba/src/index.ts` and `xrpc-adapter/src/index.ts` together, or
;; reads either against the READMEs that document them.
;;
;; The facts checked here are *between* files, so they belong to no plane:
;; `kotoba/test/houki.test.ts` imports four functions from one module and
;; cannot see the adapter, the adapter READMEs, or CLAUDE.md; the adapter has
;; no test at all.
;;
;; These checks read source text and do not execute the TypeScript. That is
;; not a limitation being worked around. A route table, an export list, an
;; import list, an interface's field names and a brace are textual facts, and
;; the disagreements between them are visible in the text. Executing the
;; kotoba slice would prove less, not more: it runs against a mock substrate
;; and cannot observe the adapter, and the adapter **does not parse** (below),
;; so there is nothing there to execute at all.
;;
;; It is also cheap on purpose. `docs/operator-quickstart.md` §4 measured the
;; kotoba install at 26 minutes on this workstation — the two git dependencies
;; run `tsc` in their `prepare` — and §6 measured that the adapter's own
;; install cannot succeed from this repo at any price. This file needs nbb and
;; the checkout.
;;
;; ## What "pinned" means here
;;
;; Some checks record agreement (routes ↔ exports). Most record *disagreement*
;; (the unclosed brace, the five untested operations, the README parameter
;; names, the unused bearer token). Both kinds are pinned the same way: as the
;; observed value. A check going red therefore means "this fact moved", not
;; necessarily "someone broke it" — including the good case where a defect
;; gets repaired. Each message says which reading applies, because the repair
;; case needs README.md updated in the same commit, and the regression case
;; does not.
;;
;; ## Exit codes are three-valued
;;
;;   0  every check passed
;;   1  a check failed — the report names which fact moved
;;   2  REFUSED — a file or an anchor this reads is missing, so nothing was
;;      measured. A checker that cannot see its input must not answer "clean";
;;      that is the failure mode CLAUDE.md's six questions are about.
;;
;; Run: nbb test/cross_plane_test.cljs

(ns cross-plane-test
  (:require ["node:fs" :as fs]
            ["node:path" :as path]
            [clojure.set :as set]
            [clojure.string :as str]))

(def root
  "Repo root = the directory holding this test/ directory."
  (path/resolve (path/join (path/dirname (or js/__filename "test/cross_plane_test.cljs")) "..")))

;; ── refusal ────────────────────────────────────────────────────────────────
;;
;; Collected rather than thrown, so one run reports every reason it could not
;; measure instead of only the first.

(def refusals (atom []))
(defn- refuse! [why] (swap! refusals conj why) nil)

(defn- read-source
  "Source text, or a refusal. Returns nil when absent — every caller treats
   nil as 'not measured', never as 'empty'."
  [rel]
  (let [p (path/join root rel)]
    (if-not (fs/existsSync p)
      (refuse! (str "missing source: " rel))
      (let [s (str (fs/readFileSync p "utf8"))]
        (if (str/blank? s)
          (refuse! (str "empty source: " rel))
          s)))))

(defn- between
  "The slice of `s` strictly between the first `open` and the following
   `close`. Refuses when either anchor is absent or out of order — an anchor
   that has been renamed must not silently widen the region to the whole file,
   which is how a scoped scan turns into a file-wide one."
  [s rel open close]
  (when s
    (let [i (str/index-of s open)
          j (when i (str/index-of s close i))]
      (cond
        (nil? i) (refuse! (str "anchor not found in " rel ": " (pr-str open)))
        (nil? j) (refuse! (str "closing anchor not found in " rel ": " (pr-str close)))
        :else (subs s (+ i (count open)) j)))))

(defn- matches
  "Every capture group 1 of `re` in `s`, de-duplicated, as a set. Refuses when
   fewer than `floor` distinct hits: a regex that stopped matching returns the
   empty set, and the empty set agrees with every subset assertion below."
  [s label floor re]
  (when s
    (let [found (into #{} (map second) (re-seq re s))]
      (if (< (count found) floor)
        (refuse! (str "scanned " (count found) " " label
                      " (floor " floor ") — the extractor stopped matching"))
        found))))

(defn- comma-names [blocks]
  (into #{} (comp (mapcat #(str/split % #",")) (map str/trim) (remove str/blank?)) blocks))

;; ── checks ──────────────────────────────────────────────────────────────────

(def results (atom []))

(defn- check [nm ok? msg]
  (swap! results conj {:name nm :ok? (boolean ok?) :msg msg}))

(defn- show [v] (pr-str (if (set? v) (vec (sort v)) v)))

(defn- check= [nm expected actual what]
  (check nm (= expected actual)
         (if (= expected actual)
           (str what " = " (show actual))
           (str what " moved"
                "\n         expected: " (show expected)
                "\n         actual:   " (show actual)
                (when (and (set? expected) (set? actual))
                  (str "\n         gone:     " (show (set/difference expected actual))
                       "\n         new:      " (show (set/difference actual expected))))))))

;; ── plane 1: the kotoba slice ───────────────────────────────────────────────

(def kotoba-index (read-source "kotoba/src/index.ts"))

(def kotoba-ops
  "Value exports re-exported from the two implementation modules. The
   `export * from \"./types.js\"` line is deliberately excluded: it re-exports
   types, which are not callable operations and which the adapter cannot
   route."
  (comma-names
   (matches kotoba-index "kotoba export blocks" 2
            #"export\s*\{([^}]*)\}\s*from\s*\"\./(?:documentRegistry|rules)\.js\"")))

(def kotoba-types (read-source "kotoba/src/types.ts"))
(def kotoba-registry (read-source "kotoba/src/documentRegistry.ts"))
(def kotoba-rules (read-source "kotoba/src/rules.ts"))

(defn- interface-fields
  "Field names declared directly by `export interface <nm>`. Refuses when the
   interface is absent or declares nothing — an empty field set is a subset of
   everything, so it would silently agree with the assertions below."
  [nm]
  (when kotoba-types
    (let [re (re-pattern (str "export interface " nm "\\s*\\{([^}]*)\\}"))
          body (second (re-find re kotoba-types))]
      (if-not body
        (refuse! (str "kotoba/src/types.ts: interface " nm " not found"))
        (let [fs (into #{} (map second) (re-seq #"(?m)^\s*(\w+)\??\s*:" body))]
          (if (empty? fs)
            (refuse! (str "kotoba/src/types.ts: interface " nm " declared no fields"))
            fs))))))

;; The four GET endpoints the adapter routes, and the input interface each one
;; actually hands to the kotoba slice.
(def get-input-interfaces
  {"getDocument"      "GetDocumentInput"
   "listDocuments"    "ListDocumentsInput"
   "listRules"        "ListRulesInput"
   "listRuleBundles"  "ListRuleBundlesInput"
   "getRuleBundle"    "GetRuleBundleInput"})

;; ── plane 2: the XRPC adapter ───────────────────────────────────────────────

(def adapter (read-source "xrpc-adapter/src/index.ts"))

(def adapter-base
  (when adapter
    (or (second (re-find #"const\s+NSID_BASE\s*=\s*\"([^\"]+)\"" adapter))
        (refuse! "xrpc-adapter/src/index.ts: NSID_BASE not found"))))

(def adapter-routes
  (matches adapter "adapter routes" 8 #"\[`\$\{NSID_BASE\}\.(\w+)`\]"))

(defn- strip-ts
  "TypeScript with comments and string/template literals removed, so that a
   brace count is a count of *syntactic* braces. Written out rather than
   regex-substituted because a template literal may contain a quote and a
   string may contain a slash; a scanner gets both right and a regex does not."
  [s]
  (let [n (count s)]
    (loop [i 0, out []]
      (if (>= i n)
        (str/join out)
        (let [c (nth s i)
              d (when (< (inc i) n) (nth s (inc i)))]
          (cond
            (and (= c \/) (= d \/))
            (recur (let [j (str/index-of s "\n" i)] (if j j n)) out)

            (and (= c \/) (= d \*))
            (recur (let [j (str/index-of s "*/" i)] (if j (+ j 2) n)) out)

            (or (= c \") (= c \') (= c \`))
            ;; Skip to the matching unescaped delimiter. `${…}` inside a
            ;; template literal is dropped with it; its braces are balanced,
            ;; so dropping them cannot change the balance being measured.
            (recur (loop [j (inc i)]
                     (cond (>= j n) n
                           (= (nth s j) \\) (recur (+ j 2))
                           (= (nth s j) c) (inc j)
                           :else (recur (inc j))))
                   out)

            :else (recur (inc i) (conj out c))))))))

(def adapter-brace-balance
  "open − close over the adapter's syntactic braces. Zero means the file could
   parse; anything else means it cannot."
  (when adapter
    (let [code (strip-ts adapter)
          o (count (filter #(= \{ %) code))
          c (count (filter #(= \} %) code))]
      (if (< o 20)
        (refuse! (str "xrpc-adapter/src/index.ts: stripped to " o
                      " open braces (floor 20) — the scanner ate the file"))
        (- o c)))))

(def bearer-token-uses
  (when adapter (count (re-seq #"\bbearerToken\b" adapter))))

(def adapter-get-coercions
  (matches (between adapter "xrpc-adapter/src/index.ts"
                    "// Coerce common numeric/boolean fields"
                    "} catch (err) {")
           "adapter GET coercions" 2 #"if \(typed\.(\w+)\)"))

;; ── plane 3: the prose that documents them ──────────────────────────────────

(def houki-test (read-source "kotoba/test/houki.test.ts"))

(def tested-ops
  (comma-names
   (matches houki-test "test import blocks" 1
            #"import\s*\{([^}]*)\}\s*from\s*\"\.\./src/index\.js\"")))

(def adapter-readme (read-source "xrpc-adapter/README.md"))

(def adapter-readme-get-params
  "Every `<endpoint>?<param>=` pair the adapter's README lists, as
   endpoint → param."
  (when adapter-readme
    (let [ps (into {} (map (fn [[_ ep p]] [ep p]))
                   (re-seq #"GET /xrpc/com\.etzhayyim\.houki\.(\w+)\?(\w+)=" adapter-readme))]
      (if (< (count ps) 4)
        (refuse! (str "xrpc-adapter/README.md: scanned " (count ps)
                      " documented GET parameters (floor 4)"))
        ps))))

(def kotoba-readme (read-source "kotoba/README.md"))
(def claude-md (read-source "CLAUDE.md"))

(def adapter-pkg (read-source "xrpc-adapter/package.json"))

;; CLAUDE.md's vocabulary: the command names, channels and identifiers it
;; describes as this actor's surface. README.md says none of them appears in
;; the source; that is the fact pinned here, and it is the one most likely to
;; move, because implementing any of them is the obvious next task.
(def claude-md-vocabulary
  ["refresh-document" "ingest-document" "extract-rules" "register-rule-bundle"
   "houki-feed" "houki-alerts" "houki-bundles"
   "WRecord" "stripHTML" "h0uk1001" "completer" "yata"])

(def source-files
  ["kotoba/src/index.ts" "kotoba/src/types.ts" "kotoba/src/documentRegistry.ts"
   "kotoba/src/rules.ts" "xrpc-adapter/src/index.ts"])

(def source-text
  (let [texts (keep read-source source-files)]
    (when (= (count texts) (count source-files))
      (str/join "\n" texts))))

;; ── the facts ───────────────────────────────────────────────────────────────

(def expected-ops
  #{"ingestDocument" "ingestText" "getDocument" "listDocuments"
    "extractRules" "listRules" "getRuleBundle" "listRuleBundles"
    "registerRuleBundle"})

(def expected-tested
  "The four the suite imports. README.md §'What the test suite does and does
   not cover' is the prose form of this set."
  #{"ingestDocument" "ingestText" "getDocument" "listDocuments"})

(defn- run! []
  ;; --- agreement: the adapter is a faithful projection of the kotoba slice
  (when (and kotoba-ops adapter-routes)
    (check= "kotoba-exports-are-the-nine-operations" expected-ops kotoba-ops
            "kotoba/src/index.ts value exports")
    (check "xrpc-routes-cover-every-kotoba-export"
           (empty? (set/difference kotoba-ops adapter-routes))
           (let [d (set/difference kotoba-ops adapter-routes)]
             (if (empty? d)
               (str "all " (count kotoba-ops) " exports are routed")
               (str "exported but unroutable over XRPC: " (show d)))))
    (check "xrpc-routes-add-nothing-kotoba-does-not-export"
           (empty? (set/difference adapter-routes kotoba-ops))
           (let [d (set/difference adapter-routes kotoba-ops)]
             (if (empty? d)
               (str "all " (count adapter-routes) " routes resolve to an export")
               (str "routed but not exported: " (show d))))))

  (when adapter-base
    (check= "adapter-nsid-base-is-com-etzhayyim-houki"
            "com.etzhayyim.houki" adapter-base "xrpc-adapter NSID_BASE"))

  ;; --- disagreement: the Worker this repo ships does not parse
  (when adapter-brace-balance
    (check "xrpc-adapter-source-does-not-parse"
           (not= 0 adapter-brace-balance)
           (if (zero? adapter-brace-balance)
             (str "the braces in xrpc-adapter/src/index.ts now BALANCE. That is "
                  "repair, not regression — but README.md still says the Worker "
                  "\"Does not compile as shipped\" and docs/operator-quickstart.md "
                  "§6 still pastes the TS1005. Update all three together, and "
                  "note that a parsing Worker still has no session: see "
                  "bearer-token-is-extracted-and-never-used.")
             (str adapter-brace-balance " unclosed brace(s) — `createAuthedEtzhayyim({ env: {` "
                  "opens two and closes one. `wrangler deploy` cannot have "
                  "succeeded from this tree"))))

  ;; --- disagreement: five of nine operations have no test
  (when (and kotoba-ops tested-ops)
    (check= "the-suite-imports-only-the-document-tier" expected-tested tested-ops
            "kotoba/test/houki.test.ts imports")
    (check= "five-of-nine-operations-have-no-test"
            (set/difference expected-ops expected-tested)
            (set/difference kotoba-ops tested-ops)
            "kotoba exports with no test")
    (check "every-tested-name-is-an-export"
           (empty? (set/difference tested-ops kotoba-ops))
           (let [d (set/difference tested-ops kotoba-ops)]
             (if (empty? d)
               (str (count tested-ops) " imported names all resolve to an export")
               (str "the suite imports names the barrel does not export: " (show d))))))

  ;; --- disagreement: the adapter's own README names parameters that do not
  ;; exist on the input types its endpoints hand to the slice
  (when adapter-readme-get-params
    (let [judged (into {} (keep (fn [[ep p]]
                                  (when-let [iface (get get-input-interfaces ep)]
                                    (when-let [fields (interface-fields iface)]
                                      [ep [p iface (contains? fields p)]]))))
                       adapter-readme-get-params)
          bogus (into #{} (keep (fn [[ep [p _ ok?]]] (when-not ok? (str ep "?" p)))) judged)]
      (if (< (count judged) 4)
        (refuse! (str "judged " (count judged) " documented GET parameters (floor 4)"))
        (check= "adapter-readme-get-params-name-fields-their-input-types-lack"
                #{"getDocument?documentId" "listDocuments?authorDid"
                  "listRules?ruleSeq" "listRuleBundles?registrarDid"}
                bogus
                (str "documented GET parameters absent from the input type "
                     "(of " (count judged) " judged; a caller passing them gets "
                     "an unfiltered list or a missing-id rejection)")))))

  ;; --- disagreement: the adapter coerces query fields no GET input declares
  (when (and adapter-get-coercions kotoba-types)
    (let [get-fields (reduce set/union #{}
                             (keep (fn [[_ iface]] (interface-fields iface))
                                   get-input-interfaces))]
      (when (seq get-fields)
        (check= "adapter-coerces-query-fields-no-get-input-type-declares"
                #{"offset" "ruleSeq"}
                (set/difference adapter-get-coercions get-fields)
                (str "GET coercions with no field on any of the five GET input "
                     "types (ruleSeq exists, but on ExtractRuleInput — a POST "
                     "body element)")))))

  ;; --- disagreement: the session never reaches the SDK
  (when bearer-token-uses
    (check "bearer-token-is-extracted-and-never-used"
           (= 1 bearer-token-uses)
           (if (= 1 bearer-token-uses)
             (str "`bearerToken` occurs once in xrpc-adapter/src/index.ts — its "
                  "own declaration. Fixing the brace would give a Worker that "
                  "parses and still authenticates as nobody")
             (str "`bearerToken` now occurs " bearer-token-uses " times. If it is "
                  "being passed to createAuthedEtzhayyim that is repair — "
                  "README.md's row \"no session reaches the SDK\" is then stale"))))

  ;; --- disagreement: no document body is ever persisted
  (when (and kotoba-types kotoba-registry)
    (let [declared (count (re-seq #"\bfetchedContent\b" kotoba-types))
          read-in-impl (count (re-seq #"\bfetchedContent\b" kotoba-registry))]
      (check "fetched-content-is-declared-and-never-read"
             (and (pos? declared) (zero? read-in-impl))
             (cond
               (zero? declared)
               "IngestDocumentInput.fetchedContent is GONE from types.ts — the field README.md describes no longer exists"
               (pos? read-in-impl)
               (str "documentRegistry.ts now reads fetchedContent (" read-in-impl
                    " occurrences). That is repair: this slice would finally "
                    "persist a body. README.md says it never does")
               :else
               (str "declared in types.ts (" declared "x), read in "
                    "documentRegistry.ts 0x — the caller's body is accepted and "
                    "dropped")))))

  ;; --- disagreement: notFound answers carry no status, so the adapter says 200
  (when (and kotoba-registry kotoba-rules adapter)
    (let [not-founds (concat (re-seq #"return \{ error: \"notFound\" \}" kotoba-registry)
                             (re-seq #"return \{ error: \"notFound\" \}" kotoba-rules))
          maps-not-found? (boolean (re-find #"status === \"notFound\"" adapter))]
      (if (< (count not-founds) 2)
        (refuse! (str "scanned " (count not-founds)
                      " statusless notFound returns (floor 2) — the extractor stopped matching"))
        (check "notfound-answers-carry-no-status-so-the-adapter-answers-200"
               maps-not-found?
               (str (count not-founds) " reads return { error: \"notFound\" } with no "
                    "`status` field, while mapStatus"
                    (if maps-not-found?
                      (str " keys on status === \"notFound\" → the branch is "
                           "unreachable from those two, and a missing document "
                           "is answered HTTP 200")
                      (str " no longer has a notFound branch at all — re-read "
                           "mapStatus before trusting README.md's row on this")))))))

  ;; --- disagreement: CLAUDE.md describes a design this tree never contained
  (when source-text
    (let [present (into #{} (filter #(str/includes? source-text %)) claude-md-vocabulary)]
      (check= "claude-md-vocabulary-appears-nowhere-in-the-source"
              #{} present
              (str "CLAUDE.md identifiers found in the " (count source-files)
                   " source files (probed " (count claude-md-vocabulary) ")"))))

  (when claude-md
    (let [did (second (re-find #"did:web:([\w.\-]+)" claude-md))]
      (if-not did
        (refuse! "CLAUDE.md: no did:web: found")
        (check "claude-md-bot-did-is-not-the-did-the-source-writes"
               (and source-text (not (str/includes? source-text did)))
               (if (and source-text (str/includes? source-text did))
                 (str "CLAUDE.md's DID did:web:" did " now appears in the source — "
                      "the two agree, and README.md's row saying they do not is stale")
                 (str "CLAUDE.md names did:web:" did
                      "; no source file mentions it (they use did:web:houki.etzhayyim.com)"))))))

  ;; --- disagreement: three coverage claims in two files
  (when (and kotoba-readme kotoba-index)
    (let [headline (boolean (re-find #"8 of 8 \(100%\) canonical" kotoba-readme))
          table    (boolean (re-find #"\*\*houki\*\* \| \*\*4/8\*\*" kotoba-readme))
          barrel   (boolean (re-find #"Slice 1: 4 of 8 lexicons ported" kotoba-index))]
      (check "kotoba-readme-states-coverage-two-incompatible-ways"
             (and headline table barrel)
             (if (and headline table barrel)
               (str "kotoba/README.md line 7 says 8 of 8 (100%), its own table says "
                    "houki 4/8 active, and kotoba/src/index.ts says \"Slice 1: 4 of 8 "
                    "lexicons ported\" — nine functions are exported, so the first is "
                    "right and the other two are pre-extraction leftovers")
               (str "one of the three coverage statements has moved "
                    "(headline-8of8=" headline " table-4of8=" table " barrel-4of8=" barrel
                    "). If they now agree that is repair; README.md's row must go with it")))))

  ;; --- disagreement: the adapter cannot be installed from this repo
  (when adapter-pkg
    (let [ws (count (re-seq #"workspace:\*" adapter-pkg))
          root-pkg (path/join root "package.json")]
      (check "adapter-depends-on-a-workspace-that-does-not-exist-here"
             (and (pos? ws) (not (fs/existsSync root-pkg)))
             (cond
               (zero? ws) "xrpc-adapter/package.json no longer uses the workspace:* protocol — it may now be installable; docs/operator-quickstart.md §6 measured that it was not"
               (fs/existsSync root-pkg) "a root package.json has appeared — if it declares workspaces, §6's rejection is stale"
               :else (str "xrpc-adapter/package.json declares " ws
                          " workspace:* dependency and there is no package.json at "
                          "the repo root to resolve it against"))))))

;; ── report ──────────────────────────────────────────────────────────────────

(run!)

(let [rs @results
      failed (remove :ok? rs)
      refused @refusals]
  (println "── app-houki cross-plane checks ──")
  (println (str "SCANNED\tkotoba-exports=" (count (or kotoba-ops []))
                " xrpc-routes=" (count (or adapter-routes []))
                " tested-ops=" (count (or tested-ops []))
                " readme-get-params=" (count (or adapter-readme-get-params {}))
                " get-coercions=" (count (or adapter-get-coercions []))
                " brace-balance=" (or adapter-brace-balance "n/a")))
  (doseq [{:keys [name ok? msg]} rs]
    (println (str (if ok? "  ok   " "  FAIL ") name)
             (str "\n         " msg)))
  (cond
    (seq refused)
    (do (println)
        (println "REFUSED — nothing was measured for:")
        (doseq [r refused] (println (str "  · " r)))
        (println (str "Refusing to report a pass on " (count rs) " checks that did run;"
                      " a checker blind to its input must not answer \"clean\"."))
        (js/process.exit 2))

    (seq failed)
    (do (println)
        (println (str "cross-plane: " (count failed) " of " (count rs) " checks FAILED"))
        (js/process.exit 1))

    :else
    (do (println)
        (println (str "cross-plane: OK (" (count rs) " checks)"))
        (js/process.exit 0))))
