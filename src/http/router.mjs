import { handleEtsyAuthStart, handleEtsyAuthCallback } from "../etsy/oauth.mjs";
import { handleEtsyWebhook } from "../etsy/webhooks.mjs";
import { handleMcp } from "../mcp/http.mjs";

function json(status, data, extraHeaders = {}) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
    body: JSON.stringify(data),
  };
}

export async function handleRequest({ method, url, headers, body }) {
  const path = url.pathname.replace(/\/$/, "") || "/";

  if (method === "GET" && (path === "/" || path === "")) {
    return json(200, {
      name: "grok-automation-hub",
      etsy_app: "grok-automations",
      status: "etsy_calls_blocked_until_personal_approval",
      endpoints: {
        mcp: "/mcp",
        auth: "/auth/etsy",
        callback: "/auth/etsy/callback",
        webhooks: "/webhooks/etsy",
        health: "/health",
      },
    });
  }

  if (method === "GET" && path === "/health") {
    return json(200, {
      ok: true,
      etsyKeyConfigured: Boolean(process.env.ETSY_API_KEY),
      supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      approvalGate: process.env.ETSY_ALLOW_LIVE === "true" ? "live" : "pending",
    });
  }

  if (method === "GET" && path === "/auth/etsy") return handleEtsyAuthStart(url);
  if (method === "GET" && path === "/auth/etsy/callback") return handleEtsyAuthCallback(url);
  if (method === "POST" && path === "/webhooks/etsy") {
    return handleEtsyWebhook({ headers, body });
  }
  if (path === "/mcp") return handleMcp({ method, headers, body });

  return json(404, { error: "not_found", path });
}
