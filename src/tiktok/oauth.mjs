import crypto from "node:crypto";
import {
  saveTikTokOauthSession,
  takeTikTokOauthSession,
  saveTikTokTokens,
  getTikTokTokens,
} from "../store/tiktok-tokens.mjs";

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

const DEFAULT_SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.list,video.upload";
const FORBIDDEN_SCOPE = "video.publish";

function json(status, data) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(data),
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function html(status, text) {
  return {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: `<!doctype html><meta charset="utf-8"><pre>${escapeHtml(text)}</pre>`,
  };
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function defaultTikTokScopes() {
  const raw = process.env.TIKTOK_SCOPES || DEFAULT_SCOPES;
  const parts = String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== FORBIDDEN_SCOPE);
  return parts.join(",");
}

export function expectedTikTokUsername() {
  return String(process.env.TIKTOK_EXPECTED_USERNAME || "albertosusarte").replace(/^@/, "");
}

export function getTikTokRedirectUri(requestUrl) {
  if (process.env.TIKTOK_REDIRECT_URI) return process.env.TIKTOK_REDIRECT_URI;
  if (process.env.PUBLIC_BASE_URL) {
    return `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/auth/tiktok/callback`;
  }
  if (requestUrl) {
    return `${requestUrl.origin}/auth/tiktok/callback`;
  }
  return "";
}

export function checkTikTokAccount({ openId, username }) {
  const expectedOpenId = process.env.TIKTOK_EXPECTED_OPEN_ID || "";
  const expectedUsername = expectedTikTokUsername().toLowerCase();
  if (expectedOpenId && openId && openId !== expectedOpenId) {
    return {
      mismatch: true,
      reason: "open_id_mismatch",
      expectedUsername,
      message: "Connected TikTok open_id does not match TIKTOK_EXPECTED_OPEN_ID. Tokens were not saved.",
    };
  }
  if (username) {
    const normalized = String(username).replace(/^@/, "").toLowerCase();
    if (normalized !== expectedUsername) {
      return {
        mismatch: true,
        reason: "username_mismatch",
        expectedUsername,
        actualUsername: username,
        message: `Connected TikTok username "${username}" is not @${expectedUsername}. Tokens were not saved.`,
      };
    }
  }
  return { mismatch: false, expectedUsername };
}

export function redactTikTokPayload(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? obj.map((v) => redactTikTokPayload(v)) : { ...obj };
  if (Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(out)) {
    if (/token|secret|client_key|verifier|authorization/i.test(k)) {
      out[k] = "[redacted]";
    } else if (v && typeof v === "object") {
      out[k] = redactTikTokPayload(v);
    }
  }
  return out;
}

export function parseTikTokTokenPayload(data) {
  const src = data?.access_token ? data : data?.data && data.data.access_token ? data.data : data;
  if (!src?.access_token) return null;
  const expiresIn = Number(src.expires_in || 86400);
  const refreshExpiresIn = Number(src.refresh_expires_in || 0);
  return {
    accessToken: src.access_token,
    refreshToken: src.refresh_token || null,
    openId: src.open_id || null,
    scopes: String(src.scope || defaultTikTokScopes()),
    tokenType: src.token_type || "Bearer",
    expiresAt: Date.now() + expiresIn * 1000,
    refreshExpiresAt: refreshExpiresIn ? Date.now() + refreshExpiresIn * 1000 : 0,
  };
}

export async function createTikTokAuthorizeSession(requestUrl) {
  const key = process.env.TIKTOK_CLIENT_KEY;
  if (!key) return { error: "TIKTOK_CLIENT_KEY missing" };
  const redirectUri = getTikTokRedirectUri(requestUrl);
  if (!redirectUri.startsWith("https://") && !redirectUri.includes("localhost")) {
    return {
      error: "redirect_uri_not_ready",
      hint: "Set PUBLIC_BASE_URL or TIKTOK_REDIRECT_URI after Vercel deploy",
    };
  }
  const scopes = defaultTikTokScopes();
  const state = b64url(crypto.randomBytes(24));
  await saveTikTokOauthSession({ state, verifier: null, createdAt: Date.now() });
  const params = new URLSearchParams({
    client_key: key,
    scope: scopes,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return {
    authorizeUrl: `${AUTH_URL}?${params}`,
    redirectUri,
    scopes,
    state,
    expectedUsername: expectedTikTokUsername(),
  };
}

export async function handleTikTokAuthStart(requestUrl) {
  const session = await createTikTokAuthorizeSession(requestUrl);
  if (session.error) return json(500, session);
  return {
    status: 302,
    headers: { Location: session.authorizeUrl },
    body: "",
  };
}

async function fetchUserInfo(accessToken) {
  const fields = [
    "open_id",
    "union_id",
    "avatar_url",
    "display_name",
    "username",
    "bio_description",
    "profile_deep_link",
    "is_verified",
  ].join(",");
  const url = `${USER_INFO_URL}?fields=${encodeURIComponent(fields)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return data?.data?.user || data?.user || null;
}

export async function exchangeTikTokCode({ code, redirectUri }) {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY || "",
    client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cache-control": "no-cache",
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  const tokens = parseTikTokTokenPayload(data);
  const tokenErr = typeof data?.error === "string" || (data?.error?.code && data.error.code !== "ok");
  if (!tokens || !res.ok || tokenErr) {
    const err = new Error("token_exchange_failed");
    err.details = redactTikTokPayload(data);
    err.status = res.status;
    throw err;
  }
  return tokens;
}

export async function refreshTikTokAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY || "",
    client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cache-control": "no-cache",
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  const tokens = parseTikTokTokenPayload(data);
  const tokenErr = typeof data?.error === "string" || (data?.error?.code && data.error.code !== "ok");
  if (!tokens || !res.ok || tokenErr) {
    throw new Error(`refresh_failed:${res.status}`);
  }
  tokens.refreshToken = tokens.refreshToken || refreshToken;
  const existing = await getTikTokTokens();
  tokens.openId = tokens.openId || existing?.openId || null;
  tokens.username = tokens.username || existing?.username || null;
  tokens.scopes = tokens.scopes || existing?.scopes || "";
  await saveTikTokTokens(tokens);
  return tokens;
}

export async function handleTikTokAuthCallback(requestUrl) {
  const err = requestUrl.searchParams.get("error");
  if (err) {
    return html(
      400,
      `TikTok OAuth error: ${err} ${requestUrl.searchParams.get("error_description") || ""}`,
    );
  }
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (!code || !state) return html(400, "Missing code or state");
  const session = await takeTikTokOauthSession(state);
  if (!session) return html(400, "Invalid or expired OAuth state");
  if (process.env.TIKTOK_ALLOW_LIVE !== "true") {
    return html(
      200,
      "OAuth callback received. Live token exchange is gated until TIKTOK_ALLOW_LIVE=true.",
    );
  }
  const key = process.env.TIKTOK_CLIENT_KEY;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!key || !secret) return html(500, "TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET missing");
  const redirectUri = getTikTokRedirectUri(requestUrl);
  let tokens;
  try {
    tokens = await exchangeTikTokCode({ code, redirectUri });
  } catch (e) {
    return html(400, `Token exchange failed: ${JSON.stringify(e.details || { error: e.message })}`);
  }
  let username = null;
  try {
    const user = await fetchUserInfo(tokens.accessToken);
    username = user?.username || null;
    if (user?.open_id && !tokens.openId) tokens.openId = user.open_id;
  } catch {
    // username optional until profile scope is granted
  }
  tokens.username = username;
  const check = checkTikTokAccount({ openId: tokens.openId, username });
  if (check.mismatch) {
    return html(403, check.message);
  }
  await saveTikTokTokens(tokens);
  const nameNote = username
    ? `username=@${username}`
    : "username not returned (profile scope may be pending)";
  return html(
    200,
    `TikTok connected. ${nameNote}. open_id stored. You can close this window and use /mcp tools. Draft inbox upload only — no public publish.`,
  );
}
