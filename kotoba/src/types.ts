/**
 * houki kotoba — record types.
 *
 * Per ADR-2605203000 Option B (PDS XRPC). houki = 法規 (law / rules) —
 * private authority intelligence agent. Handles corporate legal docs
 * (ToS, privacy policies, contracts, NDA, SLA) → LLM-extracted
 * compliance rules.
 *
 * Per `90-docs/260323-authority-chain-compliance-design.md`:
 * - houki = `private` authority kind only (corporate docs)
 * - Sibling authority apps own their respective kinds:
 *   - states / treaty / religious / customary / tradition / ethics /
 *     industry-standard (each their own actor app)
 *
 * Identity hierarchy:
 *   did:web:houki.etzhayyim.com                                 — controller
 *   did:web:houki.etzhayyim.com:document:{docId-slug}           — LegalDocument
 *   did:web:houki.etzhayyim.com:rule:{docId}-{ruleSeq}          — ExtractedRule
 *   did:web:houki.etzhayyim.com:rulebundle:{bundleId-slug}      — RuleBundle
 */

export const HOUKI_DID_PREFIX = "did:web:houki.etzhayyim.com:" as const;

export type DocumentKind =
  | "terms-of-service"
  | "privacy-policy"
  | "nda"
  | "contract"
  | "sla"
  | "other";

export type DocumentSource = "url" | "text";

// ─── Document tier (slice 1) ────────────────────────────────────────

export interface LegalDocumentRecord {
  did: string;
  docId: string;
  source: DocumentSource;
  /** URL when source=url; sha256 of inline text when source=text. */
  sourceRef: string;
  kind: DocumentKind;
  publisherDid?: string;
  publisherName?: string;
  /** Authority-chain attribution — always "private" for houki. */
  authorityKind: "private";
  /** Content-addressed blob CID (CIDv1). */
  contentCid?: string;
  /** Hash of the canonical content (sha256). */
  contentSha256: string;
  language?: string;
  effectiveAt?: string;
  expiresAt?: string;
  ingestedAt: string;
  ingestSourceUrl?: string;
  /** rkey of the LLM extraction round that produced rules (if any). */
  lastExtractionId?: string;
  createdAt: string;
}

export interface LegalDocumentView extends LegalDocumentRecord {
  documentUri: string;
}

export interface IngestDocumentInput {
  docId: string;
  url: string;
  kind: DocumentKind;
  publisherDid?: string;
  publisherName?: string;
  language?: string;
  effectiveAt?: string;
  expiresAt?: string;
  /** Pre-fetched body content (caller fetched the URL). */
  fetchedContent?: string;
  contentSha256: string;
  contentCid?: string;
}

export interface IngestDocumentOutput {
  status: "registered" | "alreadyExists" | "rejected";
  documentUri?: string;
  did?: string;
  docId?: string;
  error?: string;
}

export interface IngestTextInput {
  docId: string;
  text: string;
  kind: DocumentKind;
  publisherDid?: string;
  publisherName?: string;
  language?: string;
  effectiveAt?: string;
  expiresAt?: string;
  contentSha256: string;
  contentCid?: string;
}

export type IngestTextOutput = IngestDocumentOutput;

export interface GetDocumentInput {
  docId?: string;
}

export interface GetDocumentOutput {
  document?: LegalDocumentView;
  error?: string;
}

export interface ListDocumentsInput {
  kind?: DocumentKind;
  publisherDid?: string;
  source?: DocumentSource;
  language?: string;
  limit?: number;
  cursor?: string;
}

export interface ListDocumentsOutput {
  items: LegalDocumentView[];
  cursor?: string;
  total: number;
}

// ─── Slug helpers ───────────────────────────────────────────────────

export function idSlug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

export function documentDid(docId: string): string {
  return `${HOUKI_DID_PREFIX}document:${idSlug(docId)}`;
}

export function documentRkey(docId: string): string {
  return `document-${idSlug(docId)}`;
}

// ─── Rule + Bundle tier (slice 2) ───────────────────────────────────

export type RuleCategory =
  | "data-collection"
  | "data-sharing"
  | "data-retention"
  | "user-rights"
  | "termination"
  | "liability"
  | "indemnification"
  | "governing-law"
  | "dispute-resolution"
  | "ip-rights"
  | "consent"
  | "minors"
  | "third-party"
  | "other";

export type RuleSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ObligationDirection =
  | "user-obligation"
  | "publisher-obligation"
  | "mutual"
  | "neither";

export type PartyRole = "user" | "publisher" | "third-party" | "regulator";

export interface ExtractedRuleRecord {
  did: string;
  docId: string;
  ruleSeq: number;
  category: RuleCategory;
  severity?: RuleSeverity;
  summary: string;
  body?: string;
  excerpt?: string;
  excerptOffsetStart?: number;
  excerptOffsetEnd?: number;
  obligationDirection?: ObligationDirection;
  partyRole?: PartyRole;
  extractionModel?: string;
  extractionRunId?: string;
  extractedAt: string;
  createdAt: string;
}

export interface ExtractedRuleView extends ExtractedRuleRecord {
  ruleUri: string;
}

export interface ExtractRuleInput {
  ruleSeq: number;
  category: RuleCategory;
  severity?: RuleSeverity;
  summary: string;
  body?: string;
  excerpt?: string;
  excerptOffsetStart?: number;
  excerptOffsetEnd?: number;
  obligationDirection?: ObligationDirection;
  partyRole?: PartyRole;
}

export interface ExtractRulesInput {
  docId: string;
  rules: ExtractRuleInput[];
  model?: string;
  runId?: string;
}

export interface ExtractRulesOutput {
  status: "ok" | "rejected";
  docId?: string;
  runId?: string;
  inserted?: { ruleSeq: number; ruleUri: string; did: string }[];
  skipped?: { ruleSeq: number; reason: string }[];
  error?: string;
}

export interface ListRulesInput {
  docId?: string;
  category?: RuleCategory;
  severity?: RuleSeverity;
  obligationDirection?: ObligationDirection;
  limit?: number;
  cursor?: string;
}

export interface ListRulesOutput {
  items: ExtractedRuleView[];
  cursor?: string;
  total: number;
}

export interface RuleBundleRecord {
  did: string;
  bundleId: string;
  name: string;
  description?: string;
  categories: string[];
  ruleDids: string[];
  publisherDid?: string;
  publisherName?: string;
  issuedAt: string;
  createdAt: string;
}

export interface RuleBundleView extends RuleBundleRecord {
  bundleUri: string;
}

export interface GetRuleBundleInput {
  bundleId?: string;
}

export interface GetRuleBundleOutput {
  bundle?: RuleBundleView;
  error?: string;
}

export interface ListRuleBundlesInput {
  publisherDid?: string;
  category?: string;
  limit?: number;
  cursor?: string;
}

export interface ListRuleBundlesOutput {
  items: RuleBundleView[];
  cursor?: string;
  total: number;
}
