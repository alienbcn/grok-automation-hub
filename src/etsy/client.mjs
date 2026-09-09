import { getTokens } from "../store/tokens.mjs";
import { refreshAccessToken } from "./oauth.mjs";

const API = "https://api.etsy.com/v3";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function apiKeyHeader() {
  const key = process.env.ETSY_API_KEY;
  const secret = process.env.ETSY_SHARED_SECRET;
  if (!key) throw new Error("ETSY_API_KEY missing");
  return secret ? `${key}:${secret}` : key;
}

export async function etsyRequest(method, path, { query, json } = {}) {
  if (process.env.ETSY_ALLOW_LIVE !== "true") {
    return {
      gated: true,
      message: "Etsy app is Pending Personal Approval. No live API calls.",
      method,
      path,
    };
  }
  let tokens = await getTokens();
  if (!tokens?.accessToken) throw new Error("etsy_not_connected");
  if (tokens.expiresAt && Date.now() > tokens.expiresAt - 60_000 && tokens.refreshToken) {
    tokens = await refreshAccessToken(tokens.refreshToken);
  }
  const url = new URL(`${API}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  let last;
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, {
      method,
      headers: {
        "x-api-key": apiKeyHeader(),
        authorization: `Bearer ${tokens.accessToken}`,
        accept: "application/json",
        ...(json ? { "content-type": "application/json" } : {}),
      },
      body: json ? JSON.stringify(json) : undefined,
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep(400 * (i + 1));
      last = { status: res.status, body: await res.text() };
      continue;
    }
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: data };
    }
    return { ok: true, status: res.status, data };
  }
  return { ok: false, status: last?.status || 429, error: last?.body || "rate_limited" };
}

export async function getMe() {
  return etsyRequest("GET", "/application/users/me");
}

export async function getShop(shopId) {
  return etsyRequest("GET", `/application/shops/${shopId}`);
}

export async function getListings(shopId, state = "active") {
  return etsyRequest("GET", `/application/shops/${shopId}/listings`, {
    query: { state, limit: 25 },
  });
}

export async function getReceipts(shopId) {
  return etsyRequest("GET", `/application/shops/${shopId}/receipts`, {
    query: { limit: 25 },
  });
}

export async function createDraftListing(shopId, payload) {
  return etsyRequest("POST", `/application/shops/${shopId}/listings`, { json: payload });
}

export async function updateListing(shopId, listingId, payload) {
  return etsyRequest("PATCH", `/application/shops/${shopId}/listings/${listingId}`, {
    json: payload,
  });
}

export async function updateInventory(listingId, payload) {
  return etsyRequest("PUT", `/application/listings/${listingId}/inventory`, { json: payload });
}
