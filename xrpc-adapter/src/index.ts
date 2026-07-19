/**
 * houki XRPC adapter — CF Worker.
 *
 * Wires the kotoba reference impl (9 pure TS functions) into a deployable
 * CF Worker that exposes each function as an XRPC endpoint at
 * https://houki.etzhayyim.com/xrpc/com.etzhayyim.houki.<cmd>
 *
 * Per ADR-2605210000 first execution-layer demonstration. Instantiates the
 * Etzhayyim SDK from env bindings (PDS_URL + session), calls the kotoba
 * function with parsed input, returns the result as JSON, and maps status
 * codes to HTTP responses.
 *
 * Single-file principle: all routing and handler logic here.
 */

import {
  createAuthedEtzhayyim,
  extractBearerToken,
  type Etzhayyim,
} from "@etzhayyim/sdk-auth";
import * as houkirwFree from "@etzhayyim/houki-kotoba";

interface Env {
  ACTOR_DID: string;
  PDS_URL: string;
  L2_RPC_URL: string;
  PDS_ACCESS_JWT?: string;
  PDS_REFRESH_JWT?: string;
}

type Handler = (e: Etzhayyim, input: unknown) => Promise<unknown>;

const NSID_BASE = "com.etzhayyim.houki";

interface RouteConfig {
  method: "POST" | "GET";
  handler: Handler;
}

const routes: Record<string, RouteConfig> = {
  [`${NSID_BASE}.ingestDocument`]: {
    method: "POST",
    handler: (e, input) => houkirwFree.ingestDocument(e, input as Parameters<typeof houkirwFree.ingestDocument>[1]),
  },
  [`${NSID_BASE}.ingestText`]: {
    method: "POST",
    handler: (e, input) => houkirwFree.ingestText(e, input as Parameters<typeof houkirwFree.ingestText>[1]),
  },
  [`${NSID_BASE}.getDocument`]: {
    method: "GET",
    handler: (e, input) => houkirwFree.getDocument(e, input as Parameters<typeof houkirwFree.getDocument>[1]),
  },
  [`${NSID_BASE}.listDocuments`]: {
    method: "GET",
    handler: (e, input) => houkirwFree.listDocuments(e, input as Parameters<typeof houkirwFree.listDocuments>[1]),
  },
  [`${NSID_BASE}.extractRules`]: {
    method: "POST",
    handler: (e, input) => houkirwFree.extractRules(e, input as Parameters<typeof houkirwFree.extractRules>[1]),
  },
  [`${NSID_BASE}.listRules`]: {
    method: "GET",
    handler: (e, input) => houkirwFree.listRules(e, input as Parameters<typeof houkirwFree.listRules>[1]),
  },
  [`${NSID_BASE}.getRuleBundle`]: {
    method: "GET",
    handler: (e, input) => houkirwFree.getRuleBundle(e, input as Parameters<typeof houkirwFree.getRuleBundle>[1]),
  },
  [`${NSID_BASE}.listRuleBundles`]: {
    method: "GET",
    handler: (e, input) => houkirwFree.listRuleBundles(e, input as Parameters<typeof houkirwFree.listRuleBundles>[1]),
  },
  [`${NSID_BASE}.registerRuleBundle`]: {
    method: "POST",
    handler: (e, input) => houkirwFree.registerRuleBundle(e, input as Parameters<typeof houkirwFree.registerRuleBundle>[1]),
  },
};

/**
 * Maps result.status to HTTP status code.
 *   - rejected → 400
 *   - notFound → 400
 *   - alreadyExists / alreadyProcessed → 200 (idempotent)
 *   - other / default → 200
 *   - exception → 500
 */
function mapStatus(status?: string): number {
  if (status === "rejected") return 400;
  if (status === "notFound") return 400;
  if (status === "alreadyExists" || status === "alreadyProcessed") return 200;
  return 200;
}

function jsonResponse(
  body: unknown,
  status: number = 200,
  init?: ResponseInit
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
    ...init,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // Only handle /xrpc/* paths
    if (!url.pathname.startsWith("/xrpc/")) {
      return jsonResponse({ error: "NotFound" }, 404);
    }

    const nsid = url.pathname.slice("/xrpc/".length);
    const route = routes[nsid];

    if (!route) {
      return jsonResponse({ error: "MethodNotFound", nsid }, 404);
    }

    if (req.method !== route.method) {
      return jsonResponse({ error: "MethodNotAllowed" }, 405);
    }

    // Instantiate Etzhayyim SDK with PDS session attached
    const bearerToken = extractBearerToken(req);
    const e = createAuthedEtzhayyim({
      env: {
      ACTOR_DID: env.ACTOR_DID,
      PDS_URL: env.PDS_URL,
      L2_RPC_URL: env.L2_RPC_URL,
    });

    // Parse input based on method
    let input: unknown;
    try {
      if (route.method === "POST") {
        input = await req.json().catch(() => ({}));
      } else {
        // GET: parse query params
        input = Object.fromEntries(url.searchParams.entries());
        // Coerce common numeric/boolean fields
        const typed = input as Record<string, unknown>;
        if (typed.limit) typed.limit = Number(typed.limit);
        if (typed.offset) typed.offset = Number(typed.offset);
        if (typed.ruleSeq) typed.ruleSeq = Number(typed.ruleSeq);
      }
    } catch (err) {
      return jsonResponse(
        {
          error: "InvalidInput",
          message: `Failed to parse ${route.method === "POST" ? "JSON" : "query params"}`,
        },
        400
      );
    }

    // Call handler
    try {
      const result = await route.handler(e, input);
      const status = mapStatus((result as Record<string, unknown>)?.status as string | undefined);
      return jsonResponse(result, status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse(
        {
          error: "InternalError",
          message,
          nsid,
        },
        500
      );
    }
  },
} satisfies ExportedHandler<Env>;
