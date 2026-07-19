/**
 * houki kotoba — barrel.
 *
 * Per ADR-2605203000 Option B Phase E reference implementation.
 * houki = 法規 / private authority intelligence agent (corporate legal
 * docs → LLM-extracted compliance rules).
 *
 * Slice 1: 4 of 8 lexicons ported.
 *   ingestDocument + ingestText + getDocument + listDocuments
 *
 * Follow-up slices:
 *   extractRules / listRules — LLM extraction tier (LangServer pod-side)
 *   getRuleBundle / listRuleBundles — bundle tier (cross-actor consumption)
 */

export * from "./types.js";
export {
  ingestDocument,
  ingestText,
  getDocument,
  listDocuments,
} from "./documentRegistry.js";
export {
  extractRules,
  listRules,
  getRuleBundle,
  listRuleBundles,
  registerRuleBundle,
} from "./rules.js";
