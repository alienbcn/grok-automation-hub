import { handleEtsyAuthStart, handleEtsyAuthCallback } from "../etsy/oauth.mjs";
import { handleTikTokAuthStart, handleTikTokAuthCallback } from "../tiktok/oauth.mjs";
import { handleEtsyWebhook } from "../etsy/webhooks.mjs";
import { handleMcp } from "../mcp/http.mjs";
import { browserbaseConfigured, runSmokeTest } from "../browser/remote.mjs";
import { getTokens } from "../store/tokens.mjs";
import { getTikTokTokens } from "../store/tiktok-tokens.mjs";

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
      etsyAppAccess: "personal",
      shopNameHint: "NovomartStudio",
      status: "etsy_live_calls_require_ETSY_ALLOW_LIVE_and_oauth",
      endpoints: {
        mcp: "/mcp",
        auth: "/auth/etsy",
        callback: "/auth/etsy/callback",
        tiktokAuth: "/auth/tiktok",
        tiktokCallback: "/auth/tiktok/callback",
        webhooks: "/webhooks/etsy",
        health: "/health",
        browserSmoke: "/browser/smoke",
      },
    });
  }

  if (method === "GET" && path === "/health") {
    const allowLive = process.env.ETSY_ALLOW_LIVE === "true";
    const tokens = await getTokens().catch(() => null);
    const tiktokTokens = await getTikTokTokens().catch(() => null);
    return json(200, {
      ok: true,
      etsyAppAccess: "personal",
      etsyKeyConfigured: Boolean(process.env.ETSY_API_KEY),
      tiktokKeyConfigured: Boolean(process.env.TIKTOK_CLIENT_KEY),
      supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      browserbaseConfigured: browserbaseConfigured(),
      allowLive,
      tiktokAllowLive: process.env.TIKTOK_ALLOW_LIVE === "true",
      approvalGate: allowLive ? "live" : "allow_live_off",
      etsyConnected: Boolean(tokens?.accessToken),
      etsyShopIdKnown: Boolean(process.env.ETSY_SHOP_ID || tokens?.shopId),
      tiktokConnected: Boolean(tiktokTokens?.accessToken),
    });
  }

  if (method === "GET" && path === "/browser/smoke") {
    const result = await runSmokeTest();
    const status = result.skipped ? 412 : result.ok ? 200 : 502;
    return json(status, result);
  }

  if (method === "GET" && path === "/auth/etsy") return handleEtsyAuthStart(url);
  if (method === "GET" && path === "/auth/etsy/callback") return handleEtsyAuthCallback(url);
  if (method === "GET" && path === "/auth/tiktok") return handleTikTokAuthStart(url);
  if (method === "GET" && path === "/auth/tiktok/callback") return handleTikTokAuthCallback(url);
  if (method === "POST" && path === "/webhooks/etsy") {
    return handleEtsyWebhook({ headers, body });
  }
  if (path === "/mcp") return handleMcp({ method, headers, body });

  return json(404, { error: "not_found", path });
}
