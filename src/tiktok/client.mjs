import { getTikTokTokens } from "../store/tiktok-tokens.mjs";
import { refreshTikTokAccessToken } from "./oauth.mjs";

const API = "https://open.tiktokapis.com";

const USER_BASIC = ["open_id", "union_id", "avatar_url", "avatar_url_100", "avatar_large_url", "display_name"];
const USER_PROFILE = ["bio_description", "profile_deep_link", "is_verified", "username"];
const USER_STATS = ["follower_count", "following_count", "likes_count", "video_count"];

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function tiktokLiveAllowed() {
  return process.env.TIKTOK_ALLOW_LIVE === "true";
}

function apiError(data) {
  const code = data?.error?.code;
  if (code && code !== "ok") return data.error;
  if (typeof data?.error === "string") return { code: data.error, message: data.error_description || data.error };
  return null;
}

async function parseResponse(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  const err = apiError(data);
  if (!res.ok || err) {
    return { ok: false, status: res.status, error: err || data };
  }
  return { ok: true, status: res.status, data };
}

async function authHeaders() {
  if (!tiktokLiveAllowed()) {
    return { gated: true };
  }
  let tokens = await getTikTokTokens();
  if (!tokens?.accessToken) throw new Error("tiktok_not_connected");
  if (tokens.expiresAt && Date.now() > tokens.expiresAt - 60_000 && tokens.refreshToken) {
    tokens = await refreshTikTokAccessToken(tokens.refreshToken);
  }
  return {
    gated: false,
    headers: {
      authorization: `Bearer ${tokens.accessToken}`,
      accept: "application/json",
    },
  };
}

export async function tiktokRequest(method, path, { query, json } = {}) {
  const auth = await authHeaders();
  if (auth.gated) {
    return {
      gated: true,
      message: "TikTok live calls require TIKTOK_ALLOW_LIVE=true and OAuth.",
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
        ...(json ? { "content-type": "application/json; charset=UTF-8" } : {}),
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

export async function getTikTokUserInfo(fields) {
  const list = fields || [...USER_BASIC, ...USER_PROFILE, ...USER_STATS];
  return tiktokRequest("GET", "/v2/user/info/", {
    query: { fields: list.join(",") },
  });
}

export async function getTikTokStats() {
  return tiktokRequest("GET", "/v2/user/info/", {
    query: { fields: ["username", "open_id", ...USER_STATS].join(",") },
  });
}

export async function listTikTokVideos({ cursor, max_count = 10 } = {}) {
  const count = Math.min(Math.max(Number(max_count) || 10, 1), 20);
  const body = { max_count: count };
  if (cursor) body.cursor = cursor;
  return tiktokRequest("POST", "/v2/video/list/", {
    query: { fields: "id,create_time,title,cover_image_url,share_url,duration,like_count,comment_count,share_count,view_count" },
    json: body,
  });
}

export async function initInboxVideo({ video_url }) {
  if (!video_url) {
    return { ok: false, status: 400, error: { message: "video_url required (PULL_FROM_URL). Do not send huge base64 on Vercel." } };
  }
  return tiktokRequest("POST", "/v2/post/publish/inbox/video/init/", {
    json: {
      source_info: {
        source: "PULL_FROM_URL",
        video_url,
      },
    },
  });
}

export async function fetchPublishStatus(publish_id) {
  if (!publish_id) {
    return { ok: false, status: 400, error: { message: "publish_id required" } };
  }
  return tiktokRequest("POST", "/v2/post/publish/status/fetch/", {
    json: { publish_id },
  });
}

export { USER_BASIC, USER_PROFILE, USER_STATS };
