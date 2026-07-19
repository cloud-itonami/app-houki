# etzhayyim-project-houki — Private Authority (企業法務文書) Intelligence Agent

## App Identity

| Key | Value |
|---|---|
| **nanoid** | `h0uk1001` |
| **domain** | `houki.etzhayyim.com` |
| **AT bot DID** | `did:web:houki-h0uk1001.etzhayyim.com` |

## Purpose

**Authority-Chain の `private` kind 担当。** 企業が公開する法務文書（利用規約、プライバシーポリシー、契約書、NDA、SLA）を取り込み、LLM でコンプライアンスルールを構造化抽出する。

**分散 Ingest Architecture**: 主権法 (states)、条約 (treaty)、宗教法 (religious)、慣習法 (customary)、家訓/文化 (tradition)、職業倫理 (ethics)、業界規制 (industry-standard) は各 authority app が自律的に ingest する。houki は企業法務文書 (private authority) のみ担当。`90-docs/260323-authority-chain-compliance-design.md` 参照。

## Architecture

### Commands

| Command | Tags | Description |
|---|---|---|
| `ingest-document` | `legal`, `document`, `ingest` | URL から法務文書を取込 (Browser WIT fallback) |
| `ingest-text` | `legal`, `document`, `ingest` | テキスト直接入力で法務文書取込 |
| `list-documents` | `legal`, `document`, `query` | 取込済み文書一覧 |
| `get-document` | `legal`, `document`, `query` | 文書詳細 + 抽出ルール |
| `extract-rules` | `legal`, `nlp`, `extraction` | 文書からルール再抽出 |
| `list-rules` | `legal`, `rules`, `query` | 抽出済みルール一覧 |
| `get-rule-bundle` | `legal`, `rules`, `bundle` | バンドル取得 (cross-actor 用) |
| `list-rule-bundles` | `legal`, `rules`, `bundle`, `query` | バンドル一覧 |
| `refresh-document` | `legal`, `document`, `crawl` | 再クロール + drift 検知 |

### W Protocol Channels

| Channel | Purpose |
|---|---|
| `houki-feed` | 文書取込・ルール抽出結果 |
| `houki-alerts` | 文書 drift 検知アラート |
| `houki-bundles` | ルールバンドル更新通知 |

### Data Model (W Protocol Event Stream)

Write: `WRecord(kind, payload)` → PDS → yata SQL direct (SHA-256 content CID)
Read (SQL): `G("Kind").Match(Eq{...}).Return("prop").Query()` (SQL)
Read (Graph): `G("Label").Match(Eq{...}).Return("prop").Query()` (SQL)

| WRecord kind | Description |
|---|---|
| `legal-document` | 法務文書メタデータ + 本文テキスト + バージョン管理 |
| `compliance-rule` | LLM 抽出済みルール (obligation_kind, risk_level, jurisdiction) |
| `rule-bundle` | ルールバンドル (completer が cross-actor で取得) |
| `document-version` | 文書バージョン差分追跡 |

### Cross-actor Integration

| Target | Direction | Purpose |
|---|---|---|
| completer (ktugb754) | houki → completer | `bundle-refresh` 通知 |
| completer (ktugb754) | completer → houki | `get-rule-bundle` 取得 |

### Document Ingestion Pipeline

```
URL/Text → HTTP GET (→ Browser WIT fallback) → stripHTML → content_hash
  → LLM ルール抽出 (murakumo) → WRecord (W Protocol Event Stream) → yata auto sync
  → WSend (houki-feed/bundles) → cross-actor bundle-refresh (completer)
```
