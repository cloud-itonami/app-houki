/**
 * houki kotoba — rules + bundle tier (slice 2, +4 → 8/8 canonical ✓).
 *
 *   extractRules       — persist LLM-extracted compliance rules from a doc
 *                        (bulk write of ExtractedRule records, rkey-seq)
 *   listRules          — cursor + docId / category / severity filter
 *   getRuleBundle      — rkey-direct read of a RuleBundle (cross-actor consume)
 *   listRuleBundles    — cursor + publisherDid / category filter
 *
 * LLM extraction itself lives in the LangServer pod (per ADR-2605111200).
 * This package persists the already-extracted result via PDS — the pod
 * computes the rules, then invokes extractRules with the result in hand.
 *
 * RuleBundles group rules across multiple documents for cross-actor
 * consumption (e.g. a "GDPR rules bundle" pulling from multiple privacy
 * policy ingestions).
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  documentRkey,
  HOUKI_DID_PREFIX,
  idSlug,
  type ExtractedRuleRecord,
  type ExtractedRuleView,
  type ExtractRulesInput,
  type ExtractRulesOutput,
  type GetRuleBundleInput,
  type GetRuleBundleOutput,
  type LegalDocumentRecord,
  type ListRuleBundlesInput,
  type ListRuleBundlesOutput,
  type ListRulesInput,
  type ListRulesOutput,
  type RuleBundleRecord,
  type RuleBundleView,
} from "./types.js";

const DOCUMENT_COLLECTION = "com.etzhayyim.houki.document";
const RULE_COLLECTION = "com.etzhayyim.houki.rule";
const RULE_BUNDLE_COLLECTION = "com.etzhayyim.houki.ruleBundle";

function ruleRkey(docId: string, ruleSeq: number): string {
  const padded = String(ruleSeq).padStart(6, "0");
  return `rule-${idSlug(docId)}-${padded}`;
}

function ruleDid(docId: string, ruleSeq: number): string {
  const padded = String(ruleSeq).padStart(6, "0");
  return `${HOUKI_DID_PREFIX}rule:${idSlug(docId)}-${padded}`;
}

function bundleRkey(bundleId: string): string {
  return `rulebundle-${idSlug(bundleId)}`;
}

function bundleDid(bundleId: string): string {
  return `${HOUKI_DID_PREFIX}rulebundle:${idSlug(bundleId)}`;
}

export async function extractRules(
  e: Etzhayyim,
  input: ExtractRulesInput
): Promise<ExtractRulesOutput> {
  if (!input.docId || !input.rules || input.rules.length === 0) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  // Verify the document exists.
  const docResp = await e
    .read<LegalDocumentRecord>({
      collection: DOCUMENT_COLLECTION,
      rkey: documentRkey(input.docId),
    })
    .catch(() => ({ records: [] }));
  if (!docResp.records[0]?.value) {
    return { status: "rejected", error: "documentNotFound" };
  }
  const inserted: { ruleSeq: number; ruleUri: string; did: string }[] = [];
  const skipped: { ruleSeq: number; reason: string }[] = [];
  const now = new Date().toISOString();

  for (const r of input.rules) {
    if (typeof r.ruleSeq !== "number" || r.ruleSeq < 1 || !r.summary || !r.category) {
      skipped.push({ ruleSeq: r.ruleSeq ?? -1, reason: "missingFields" });
      continue;
    }
    const rkey = ruleRkey(input.docId, r.ruleSeq);
    const existing = await e
      .read<ExtractedRuleRecord>({ collection: RULE_COLLECTION, rkey })
      .catch(() => ({ records: [] }));
    if (existing.records[0]?.value) {
      skipped.push({ ruleSeq: r.ruleSeq, reason: "alreadyExists" });
      continue;
    }
    const record: ExtractedRuleRecord = {
      did: ruleDid(input.docId, r.ruleSeq),
      docId: input.docId,
      ruleSeq: r.ruleSeq,
      category: r.category,
      severity: r.severity,
      summary: r.summary,
      body: r.body,
      excerpt: r.excerpt,
      excerptOffsetStart: r.excerptOffsetStart,
      excerptOffsetEnd: r.excerptOffsetEnd,
      obligationDirection: r.obligationDirection,
      partyRole: r.partyRole,
      extractionModel: input.model,
      extractionRunId: input.runId,
      extractedAt: now,
      createdAt: now,
    };
    const receipt = await e.write({
      collection: RULE_COLLECTION,
      record: record as unknown as Record<string, unknown>,
      rkey,
    });
    inserted.push({
      ruleSeq: r.ruleSeq,
      ruleUri: receipt.uri,
      did: record.did,
    });
  }

  // Update the parent document with lastExtractionId.
  if (input.runId && inserted.length > 0) {
    const existingDoc = docResp.records[0].value;
    const merged: LegalDocumentRecord = {
      ...existingDoc,
      lastExtractionId: input.runId,
    };
    await e
      .write({
        collection: DOCUMENT_COLLECTION,
        record: merged as unknown as Record<string, unknown>,
        rkey: documentRkey(input.docId),
      })
      .catch(() => undefined);
  }

  return {
    status: "ok",
    docId: input.docId,
    runId: input.runId,
    inserted,
    skipped,
  };
}

export async function listRules(
  e: Etzhayyim,
  input: ListRulesInput = {}
): Promise<ListRulesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<ExtractedRuleRecord>({
    collection: RULE_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: ExtractedRuleView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.docId && v.docId !== input.docId) return false;
      if (input.category && v.category !== input.category) return false;
      if (input.severity && v.severity !== input.severity) return false;
      if (
        input.obligationDirection &&
        v.obligationDirection !== input.obligationDirection
      ) {
        return false;
      }
      return true;
    })
    .map((r) => ({ ...r.value, ruleUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

export async function getRuleBundle(
  e: Etzhayyim,
  input: GetRuleBundleInput
): Promise<GetRuleBundleOutput> {
  if (!input.bundleId) return { error: "missingBundleId" };
  const resp = await e
    .read<RuleBundleRecord>({
      collection: RULE_BUNDLE_COLLECTION,
      rkey: bundleRkey(input.bundleId),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  const view: RuleBundleView = { ...r.value, bundleUri: r.uri };
  return { bundle: view };
}

export async function listRuleBundles(
  e: Etzhayyim,
  input: ListRuleBundlesInput = {}
): Promise<ListRuleBundlesOutput> {
  const limit = Math.min(input.limit ?? 50, 100);
  const resp = await e.read<RuleBundleRecord>({
    collection: RULE_BUNDLE_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: RuleBundleView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.publisherDid && v.publisherDid !== input.publisherDid) {
        return false;
      }
      if (input.category && !v.categories.includes(input.category)) {
        return false;
      }
      return true;
    })
    .map((r) => ({ ...r.value, bundleUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

/** Helper for creating a new RuleBundle (operator-side). */
export async function registerRuleBundle(
  e: Etzhayyim,
  input: {
    bundleId: string;
    name: string;
    description?: string;
    categories: string[];
    ruleDids: string[];
    publisherDid?: string;
    publisherName?: string;
  }
) {
  if (!input.bundleId || !input.name || input.ruleDids.length === 0) {
    return { status: "rejected" as const, error: "missingRequiredFields" };
  }
  const rkey = bundleRkey(input.bundleId);
  const existing = await e
    .read<RuleBundleRecord>({ collection: RULE_BUNDLE_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists" as const,
      bundleUri: existing.records[0].uri,
      bundleId: input.bundleId,
    };
  }
  const did = bundleDid(input.bundleId);
  const now = new Date().toISOString();
  const record: RuleBundleRecord = {
    did,
    bundleId: input.bundleId,
    name: input.name,
    description: input.description,
    categories: input.categories,
    ruleDids: input.ruleDids,
    publisherDid: input.publisherDid,
    publisherName: input.publisherName,
    issuedAt: now,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: RULE_BUNDLE_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered" as const,
    bundleUri: receipt.uri,
    bundleId: input.bundleId,
    did,
  };
}
