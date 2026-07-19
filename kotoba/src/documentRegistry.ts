/**
 * houki kotoba — document tier (slice 1, 4/8).
 *
 *   ingestDocument — register a legal doc from URL (caller fetched body)
 *   ingestText     — register a legal doc from inline text
 *   getDocument    — rkey-direct read
 *   listDocuments  — cursor + kind/publisher/source/language filter
 *
 * Both ingest paths share the same LegalDocumentRecord shape; only the
 * source field distinguishes ("url" vs "text"). LLM extraction lives
 * in the LangServer pod and writes ExtractedRule + RuleBundle records
 * in a follow-up slice.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  documentDid,
  documentRkey,
  type GetDocumentInput,
  type GetDocumentOutput,
  type IngestDocumentInput,
  type IngestDocumentOutput,
  type IngestTextInput,
  type IngestTextOutput,
  type LegalDocumentRecord,
  type LegalDocumentView,
  type ListDocumentsInput,
  type ListDocumentsOutput,
} from "./types.js";

const DOCUMENT_COLLECTION = "com.etzhayyim.houki.document";

function isSha256(s: string): boolean {
  return /^[a-f0-9]{64}$/i.test(s);
}

async function writeDocument(
  e: Etzhayyim,
  rec: LegalDocumentRecord,
  rkey: string
) {
  return await e.write({
    collection: DOCUMENT_COLLECTION,
    record: rec as unknown as Record<string, unknown>,
    rkey,
  });
}

export async function ingestDocument(
  e: Etzhayyim,
  input: IngestDocumentInput
): Promise<IngestDocumentOutput> {
  if (!input.docId || !input.url || !input.kind || !input.contentSha256) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!isSha256(input.contentSha256)) {
    return { status: "rejected", error: "invalidContentSha256" };
  }
  const rkey = documentRkey(input.docId);
  const existing = await e
    .read<LegalDocumentRecord>({ collection: DOCUMENT_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      documentUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      docId: input.docId,
    };
  }
  const now = new Date().toISOString();
  const record: LegalDocumentRecord = {
    did: documentDid(input.docId),
    docId: input.docId,
    source: "url",
    sourceRef: input.url,
    kind: input.kind,
    publisherDid: input.publisherDid,
    publisherName: input.publisherName,
    authorityKind: "private",
    contentCid: input.contentCid,
    contentSha256: input.contentSha256.toLowerCase(),
    language: input.language,
    effectiveAt: input.effectiveAt,
    expiresAt: input.expiresAt,
    ingestedAt: now,
    ingestSourceUrl: input.url,
    createdAt: now,
  };
  const receipt = await writeDocument(e, record, rkey);
  return {
    status: "registered",
    documentUri: receipt.uri,
    did: record.did,
    docId: input.docId,
  };
}

export async function ingestText(
  e: Etzhayyim,
  input: IngestTextInput
): Promise<IngestTextOutput> {
  if (!input.docId || !input.text || !input.kind || !input.contentSha256) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!isSha256(input.contentSha256)) {
    return { status: "rejected", error: "invalidContentSha256" };
  }
  const rkey = documentRkey(input.docId);
  const existing = await e
    .read<LegalDocumentRecord>({ collection: DOCUMENT_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      documentUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      docId: input.docId,
    };
  }
  const now = new Date().toISOString();
  const record: LegalDocumentRecord = {
    did: documentDid(input.docId),
    docId: input.docId,
    source: "text",
    sourceRef: input.contentSha256.toLowerCase(),
    kind: input.kind,
    publisherDid: input.publisherDid,
    publisherName: input.publisherName,
    authorityKind: "private",
    contentCid: input.contentCid,
    contentSha256: input.contentSha256.toLowerCase(),
    language: input.language,
    effectiveAt: input.effectiveAt,
    expiresAt: input.expiresAt,
    ingestedAt: now,
    createdAt: now,
  };
  const receipt = await writeDocument(e, record, rkey);
  return {
    status: "registered",
    documentUri: receipt.uri,
    did: record.did,
    docId: input.docId,
  };
}

export async function getDocument(
  e: Etzhayyim,
  input: GetDocumentInput
): Promise<GetDocumentOutput> {
  if (!input.docId) return { error: "missingDocId" };
  const resp = await e
    .read<LegalDocumentRecord>({
      collection: DOCUMENT_COLLECTION,
      rkey: documentRkey(input.docId),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  const view: LegalDocumentView = { ...r.value, documentUri: r.uri };
  return { document: view };
}

export async function listDocuments(
  e: Etzhayyim,
  input: ListDocumentsInput = {}
): Promise<ListDocumentsOutput> {
  const limit = Math.min(input.limit ?? 50, 100);
  const resp = await e.read<LegalDocumentRecord>({
    collection: DOCUMENT_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: LegalDocumentView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.kind && v.kind !== input.kind) return false;
      if (input.publisherDid && v.publisherDid !== input.publisherDid) {
        return false;
      }
      if (input.source && v.source !== input.source) return false;
      if (input.language && v.language !== input.language) return false;
      return true;
    })
    .map((r) => ({ ...r.value, documentUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}
