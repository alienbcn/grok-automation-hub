import crypto from "node:crypto";
import { saveOauthSession, takeOauthSession, saveTokens } from "../store/tokens.mjs";

const AUTH_URL = "https://www.etsy.com/oauth/connect";
const TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const DEFAULT_SCOPES =
  process.env.ETSY_SCOPES ||
  "listings_r listings_w shops_r shops_w transactions_r transactions_w profile_r";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function json(status, data) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(data),
  };
}

function html(status, text) {
  return {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: `<!doctype html><meta charset="utf-8"><pre>${text}</pre>`,
  };
}

export function getRedirectUri(requestUrl) {
  if (process.env.ETSY_REDIRECT_URI) return process.env.ETSY_REDIRECT_URI;
  if (process.env.PUBLIC_BASE_URL) {
    return `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/auth/etsy/callback`;
  }
  if (requestUrl) {
    return `${requestUrl.origin}/auth/etsy/callback`;
  }
  return "";
}

export async function handleEtsyAuthStart(requestUrl) {
  const key = process.env.ETSY_API_KEY;
  if (!key) return json(500, { error: "ETSY_API_KEY missing" });
  const redirectUri = getRedirectUri(requestUrl);
  if (!redirectUri.startsWith("https://") && !redirectUri.includes("localhost")) {
    return json(500, {
      error: "redirect_uri_not_ready",
      hint: "Set PUBLIC_BASE_URL or ETSY_REDIRECT_URI after Vercel deploy",
    });
  }
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  await saveOauthSession({ state, verifier, createdAt: Date.now() });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: key,
    redirect_uri: redirectUri,
    scope: DEFAULT_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return {
    status: 302,
    headers: { Location: `${AUTH_URL}?${params}` },
    body: "",
  };
}

export async function handleEtsyAuthCallback(requestUrl) {
  const err = requestUrl.searchParams.get("error");
  if (err) return html(400, `Etsy OAuth error: ${err} ${requestUrl.searchParams.get("error_description") || ""}`);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (!code || !state) return html(400, "Missing code or state");
  const session = await takeOauthSession(state);
  if (!session) return html(400, "Invalid or expired OAuth state");
  if (process.env.ETSY_ALLOW_LIVE !== "true") {
    return html(
      200,
      "OAuth callback received. Live token exchange is gated until ETSY_ALLOW_LIVE=true after Personal Approval."
    );
  }
  const key = process.env.ETSY_API_KEY;
  const secret = process.env.ETSY_SHARED_SECRET;
  const redirectUri = getRedirectUri(requestUrl);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: key,
    redirect_uri: redirectUri,
    code,
    code_verifier: session.verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-api-key": secret ? `${key}:${secret}` : key,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return html(400, `Token exchange failed: ${JSON.stringify(data)}`);
  await saveTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    tokenType: data.token_type,
    scopes: String(data.scope || DEFAULT_SCOPES),
  });
  return html(200, "Etsy connected. You can close this window and use /mcp tools.");
}

export async function refreshAccessToken(refreshToken) {
  const key = process.env.ETSY_API_KEY;
  const secret = process.env.ETSY_SHARED_SECRET;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: key,
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-api-key": secret ? `${key}:${secret}` : key,
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`refresh_failed:${res.status}`);
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    tokenType: data.token_type,
    scopes: String(data.scope || ""),
  };
  await saveTokens(tokens);
  return tokens;
}
