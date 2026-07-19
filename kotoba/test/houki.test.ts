import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  ingestDocument,
  ingestText,
  getDocument,
  listDocuments,
} from "../src/index.js";

describe("houki kotoba", () => {
  let e: any;
  // Valid SHA256: 64 hex characters (lowercase)
  const validSha256 =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:houki.etzhayyim.com" });
  });

  describe("ingestDocument", () => {
    it("registers a document from URL with valid input", async () => {
      const result = await ingestDocument(e, {
        docId: "tos-2025",
        url: "https://example.com/tos.txt",
        kind: "terms-of-service",
        contentSha256: validSha256,
      });

      expect(result.status).toBe("registered");
      expect(result.documentUri).toBeDefined();
      expect(result.did).toBeDefined();
      expect(result.docId).toBe("tos-2025");
    });

    it("rejects document with missing required fields", async () => {
      const result = await ingestDocument(e, {
        docId: "",
        url: "https://example.com/tos.txt",
        kind: "terms-of-service",
        contentSha256: validSha256,
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toBe("missingRequiredFields");
    });

    it("rejects document with invalid contentSha256", async () => {
      const result = await ingestDocument(e, {
        docId: "tos-bad",
        url: "https://example.com/tos.txt",
        kind: "terms-of-service",
        contentSha256: "not-valid-hash",
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toBe("invalidContentSha256");
    });

    it("sets authorityKind to private always", async () => {
      await ingestDocument(e, {
        docId: "doc1",
        url: "https://example.com/doc1.txt",
        kind: "privacy-policy",
        contentSha256: validSha256,
      });

      const doc = await getDocument(e, { docId: "doc1" });
      expect(doc.document?.authorityKind).toBe("private");
    });

    it("is idempotent on docId", async () => {
      const input = {
        docId: "tos-dup",
        url: "https://example.com/tos.txt",
        kind: "terms-of-service",
        contentSha256: validSha256,
      };

      const first = await ingestDocument(e, input);
      expect(first.status).toBe("registered");
      const firstUri = first.documentUri;

      const second = await ingestDocument(e, input);
      expect(second.status).toBe("alreadyExists");
      expect(second.documentUri).toBe(firstUri);
    });

    it("normalizes contentSha256 to lowercase", async () => {
      const input = {
        docId: "case-test",
        url: "https://example.com/doc.txt",
        kind: "nda",
        contentSha256: "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855",
      };

      await ingestDocument(e, input);
      const doc = await getDocument(e, { docId: "case-test" });
      expect(doc.document?.contentSha256).toBe(validSha256);
    });
  });

  describe("ingestText", () => {
    it("registers a document from inline text", async () => {
      const result = await ingestText(e, {
        docId: "inline-doc",
        text: "This is the full document text",
        kind: "contract",
        contentSha256: validSha256,
      });

      expect(result.status).toBe("registered");
      expect(result.documentUri).toBeDefined();
      expect(result.docId).toBe("inline-doc");
    });

    it("rejects text with invalid contentSha256", async () => {
      const result = await ingestText(e, {
        docId: "text-bad",
        text: "Some text",
        kind: "contract",
        contentSha256: "bad-hash",
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toBe("invalidContentSha256");
    });

    it("sets source to text for ingestText", async () => {
      await ingestText(e, {
        docId: "text-src",
        text: "Document content",
        kind: "sla",
        contentSha256: validSha256,
      });

      const doc = await getDocument(e, { docId: "text-src" });
      expect(doc.document?.source).toBe("text");
    });

    it("stores contentSha256 as sourceRef for text documents", async () => {
      await ingestText(e, {
        docId: "text-ref",
        text: "Content here",
        kind: "privacy-policy",
        contentSha256: validSha256,
      });

      const doc = await getDocument(e, { docId: "text-ref" });
      expect(doc.document?.sourceRef).toBe(validSha256);
    });
  });

  describe("getDocument", () => {
    beforeEach(async () => {
      await ingestDocument(e, {
        docId: "test-doc",
        url: "https://example.com/test.txt",
        kind: "terms-of-service",
        contentSha256: validSha256,
      });
    });

    it("retrieves an existing document", async () => {
      const result = await getDocument(e, { docId: "test-doc" });

      expect(result.error).toBeUndefined();
      expect(result.document).toBeDefined();
      expect(result.document?.docId).toBe("test-doc");
      expect(result.document?.documentUri).toBeDefined();
    });

    it("returns notFound for missing document", async () => {
      const result = await getDocument(e, { docId: "nonexistent" });

      expect(result.error).toBe("notFound");
      expect(result.document).toBeUndefined();
    });

    it("returns missingDocId when docId not provided", async () => {
      const result = await getDocument(e, {});

      expect(result.error).toBe("missingDocId");
      expect(result.document).toBeUndefined();
    });
  });

  describe("listDocuments", () => {
    beforeEach(async () => {
      await ingestDocument(e, {
        docId: "tos-1",
        url: "https://example.com/tos1.txt",
        kind: "terms-of-service",
        contentSha256: validSha256,
      });
      await ingestDocument(e, {
        docId: "privacy-1",
        url: "https://example.com/privacy1.txt",
        kind: "privacy-policy",
        contentSha256: validSha256,
      });
      await ingestDocument(e, {
        docId: "nda-1",
        url: "https://example.com/nda1.txt",
        kind: "nda",
        contentSha256: validSha256,
        publisherDid: "did:plc:publisher",
      });
    });

    it("lists all documents", async () => {
      const result = await listDocuments(e, {});

      expect(result.items.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it("filters documents by kind", async () => {
      const result = await listDocuments(e, { kind: "terms-of-service" });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.kind).toBe("terms-of-service");
    });

    it("filters documents by publisherDid", async () => {
      const result = await listDocuments(e, {
        publisherDid: "did:plc:publisher",
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.docId).toBe("nda-1");
    });

    it("filters documents by source", async () => {
      await ingestText(e, {
        docId: "inline-src",
        text: "Inline content",
        kind: "contract",
        contentSha256: validSha256,
      });

      const result = await listDocuments(e, { source: "text" });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.source).toBe("text");
    });

    it("respects limit parameter", async () => {
      const result = await listDocuments(e, { limit: 2 });

      expect(result.items.length).toBeLessThanOrEqual(2);
    });
  });
});
