import { getTokens } from "../store/tokens.mjs";
import { refreshAccessToken } from "./oauth.mjs";

const API = "https://api.etsy.com/v3";

function sleep(ms) {
  return new Promise((r) => r());
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function apiKeyHeader() {
  const key = process.env.ETSY_API_KEY;
  const secret = process.env.ETSY_SHARED_SECRET;
  if (!key) throw new Error("ETSY_API_KEY missing");
  return secret ? `${key}:${secret}` : key;
}

export function publishAllowed() {
  return process.env.ETSY_PUBLISH_OK === "true";
}

export function assertNotPublishing(payload = {}) {
  const state = String(payload.state || "").toLowerCase();
  if (state === "active" && !publishAllowed()) {
    const err = new Error("publish_blocked: set ETSY_PUBLISH_OK=true in Vercel to allow state=active");
    err.code = "PUBLISH_BLOCKED";
    throw err;
  }
  return payload;
}

async function authHeaders() {
  if (process.env.ETSY_ALLOW_LIVE !== "true") {
    return { gated: true };
  }
  let tokens = await getTokens();
  if (!tokens?.accessToken) throw new Error("etsy_not_connected");
  if (tokens.expiresAt && Date.now() > tokens.expiresAt - 60_000 && tokens.refreshToken) {
    tokens = await refreshAccessToken(tokens.refreshToken);
  }
  return {
    gated: false,
    headers: {
      "x-api-key": apiKeyHeader(),
      authorization: `Bearer ${tokens.accessToken}`,
      accept: "application/json",
    },
  };
}

async function parseResponse(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, status: res.status, data };
}

export async function etsyRequest(method, path, { query, json } = {}) {
  const auth = await authHeaders();
  if (auth.gated) {
    return {
      gated: true,
      message: "Etsy live calls require ETSY_ALLOW_LIVE=true and OAuth.",
      method,
      path,
    };
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
        ...auth.headers,
        ...(json ? { "content-type": "application/json" } : {}),
      },
      body: json ? JSON.stringify(json) : undefined,
    });
    if (res.status === 429 || res.status >= 500) {
      await wait(400 * (i + 1));
      last = { status: res.status, body: await res.text() };
      continue;
    }
    return parseResponse(res);
  }
  return { ok: false, status: last?.status || 429, error: last?.body || "rate_limited" };
}

export async function etsyMultipart(path, formData) {
  const auth = await authHeaders();
  if (auth.gated) {
    return {
      gated: true,
      message: "Etsy live calls require ETSY_ALLOW_LIVE=true and OAuth.",
      method: "POST",
      path,
    };
  }
  const url = `${API}${path}`;
  let last;
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: auth.headers,
      body: formData,
    });
    if (res.status === 429 || res.status >= 500) {
      await wait(400 * (i + 1));
      last = { status: res.status, body: await res.text() };
      continue;
    }
    return parseResponse(res);
  }
  return { ok: false, status: last?.status || 429, error: last?.body || "rate_limited" };
}

function stripDataUrl(b64) {
  return String(b64 || "").replace(/^data:[^;]+;base64,/, "");
}

export async function bufferFromSource({ file_base64, file_url, filename }) {
  if (file_url) {
    const res = await fetch(file_url);
    if (!res.ok) throw new Error(`source_fetch_failed:${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const name = filename || file_url.split("?")[0].split("/").pop() || "upload.bin";
    const mime = res.headers.get("content-type") || "application/octet-stream";
    return { buf, name, mime };
  }
  if (file_base64) {
    const buf = Buffer.from(stripDataUrl(file_base64), "base64");
    return {
      buf,
      name: filename || "upload.bin",
      mime: "application/octet-stream",
    };
  }
  throw new Error("file_base64_or_file_url_required");
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
  const body = { ...payload, should_auto_renew: false };
  delete body.state;
  return etsyRequest("POST", `/application/shops/${shopId}/listings`, { json: body });
}

export async function updateListing(shopId, listingId, payload) {
  assertNotPublishing(payload);
  return etsyRequest("PATCH", `/application/shops/${shopId}/listings/${listingId}`, {
    json: payload,
  });
}

export async function updateInventory(listingId, payload) {
  return etsyRequest("PUT", `/application/listings/${listingId}/inventory`, { json: payload });
}

export async function uploadListingImage(shopId, listingId, { file_base64, file_url, filename, rank, alt_text }) {
  const { buf, name } = await bufferFromSource({ file_base64, file_url, filename });
  const form = new FormData();
  form.append("image", new Blob([buf]), name);
  form.append("name", name);
  if (rank) form.append("rank", String(rank));
  if (alt_text) form.append("alt_text", String(alt_text).slice(0, 250));
  return etsyMultipart(`/application/shops/${shopId}/listings/${listingId}/images`, form);
}

export async function uploadListingFile(shopId, listingId, { file_base64, file_url, filename, rank }) {
  const { buf, name } = await bufferFromSource({ file_base64, file_url, filename });
  const form = new FormData();
  form.append("file", new Blob([buf]), name);
  form.append("name", name);
  if (rank) form.append("rank", String(rank));
  return etsyMultipart(`/application/shops/${shopId}/listings/${listingId}/files`, form);
}
