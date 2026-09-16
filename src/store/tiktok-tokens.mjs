const mem = {
  oauth: new Map(),
  tokens: null,
};

/** OAuth state TTL: 15 minutes */
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function supabaseEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function sb() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export function resetTikTokMemory() {
  mem.oauth.clear();
  mem.tokens = null;
}

export async function saveTikTokOauthSession({ state, verifier = null, createdAt }) {
  mem.oauth.set(state, { verifier, createdAt });
  if (!supabaseEnabled()) return;
  const client = await sb();
  await client.from("tiktok_oauth_sessions").upsert({
    state,
    verifier,
    created_at: new Date(createdAt).toISOString(),
  });
}

function isExpiredOauthSession(createdAt) {
  if (!createdAt || !Number.isFinite(createdAt)) return true;
  return Date.now() - createdAt > OAUTH_STATE_TTL_MS;
}

export async function takeTikTokOauthSession(state) {
  if (supabaseEnabled()) {
    const client = await sb();
    const { data } = await client.from("tiktok_oauth_sessions").select("*").eq("state", state).maybeSingle();
    if (data) {
      await client.from("tiktok_oauth_sessions").delete().eq("state", state);
      const createdAt = Date.parse(data.created_at);
      // Expired OAuth state (>15 min) — treat as invalid
      if (isExpiredOauthSession(createdAt)) return null;
      return { verifier: data.verifier, createdAt };
    }
  }
  const row = mem.oauth.get(state);
  mem.oauth.delete(state);
  if (!row) return null;
  if (isExpiredOauthSession(row.createdAt)) return null;
  return row;
}

function toRow(tokens) {
  return {
    id: "default",
    open_id: tokens.openId || null,
    username: tokens.username || null,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken || null,
    scopes: tokens.scopes || "",
    expires_at: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
    refresh_expires_at: tokens.refreshExpiresAt ? new Date(tokens.refreshExpiresAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(data) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    openId: data.open_id,
    username: data.username,
    scopes: data.scopes,
    expiresAt: data.expires_at ? Date.parse(data.expires_at) : 0,
    refreshExpiresAt: data.refresh_expires_at ? Date.parse(data.refresh_expires_at) : 0,
  };
}

export async function saveTikTokTokens(tokens) {
  mem.tokens = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || null,
    openId: tokens.openId || mem.tokens?.openId || null,
    username: tokens.username || mem.tokens?.username || null,
    scopes: tokens.scopes || mem.tokens?.scopes || "",
    expiresAt: tokens.expiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt || mem.tokens?.refreshExpiresAt || 0,
  };
  if (!supabaseEnabled()) return;
  const client = await sb();
  await client.from("tiktok_tokens").upsert(toRow(mem.tokens));
}

export async function getTikTokTokens() {
  if (supabaseEnabled()) {
    const client = await sb();
    const { data } = await client.from("tiktok_tokens").select("*").eq("id", "default").maybeSingle();
    if (data) return fromRow(data);
  }
  return mem.tokens;
}

export function tokenShapeForTests(tokens) {
  if (!tokens) return null;
  return {
    hasAccessToken: Boolean(tokens.accessToken),
    hasRefreshToken: Boolean(tokens.refreshToken),
    openId: tokens.openId || null,
    username: tokens.username || null,
    scopes: tokens.scopes || "",
    expiresAt: tokens.expiresAt || 0,
    refreshExpiresAt: tokens.refreshExpiresAt || 0,
  };
}
