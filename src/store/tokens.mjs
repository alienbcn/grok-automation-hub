const mem = {
  oauth: new Map(),
  tokens: null,
  webhooks: new Map(),
};

function supabaseEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function sb() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function saveOauthSession({ state, verifier, createdAt }) {
  mem.oauth.set(state, { verifier, createdAt });
  if (!supabaseEnabled()) return;
  const client = await sb();
  await client.from("etsy_oauth_sessions").upsert({ state, verifier, created_at: new Date(createdAt).toISOString() });
}

export async function takeOauthSession(state) {
  if (supabaseEnabled()) {
    const client = await sb();
    const { data } = await client.from("etsy_oauth_sessions").select("*").eq("state", state).maybeSingle();
    if (data) {
      await client.from("etsy_oauth_sessions").delete().eq("state", state);
      return { verifier: data.verifier, createdAt: Date.parse(data.created_at) };
    }
  }
  const row = mem.oauth.get(state);
  mem.oauth.delete(state);
  return row || null;
}

export async function saveTokens(tokens) {
  mem.tokens = { ...tokens, shopId: process.env.ETSY_SHOP_ID || tokens.shopId || null };
  if (!supabaseEnabled()) return;
  const client = await sb();
  await client.from("etsy_tokens").upsert({
    id: "default",
    shop_id: mem.tokens.shopId,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: new Date(tokens.expiresAt).toISOString(),
    scopes: tokens.scopes || "",
    updated_at: new Date().toISOString(),
  });
}

export async function getTokens() {
  if (supabaseEnabled()) {
    const client = await sb();
    const { data } = await client.from("etsy_tokens").select("*").eq("id", "default").maybeSingle();
    if (data) {
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.parse(data.expires_at),
        scopes: data.scopes,
        shopId: data.shop_id,
      };
    }
  }
  if (mem.tokens) return mem.tokens;
  if (process.env.ETSY_ACCESS_TOKEN) {
    return {
      accessToken: process.env.ETSY_ACCESS_TOKEN,
      refreshToken: process.env.ETSY_REFRESH_TOKEN,
      expiresAt: Number(process.env.ETSY_TOKEN_EXPIRES_AT || 0),
      shopId: process.env.ETSY_SHOP_ID,
    };
  }
  return null;
}

export async function rememberWebhookEvent(id) {
  if (mem.webhooks.has(id)) return false;
  mem.webhooks.set(id, Date.now());
  if (supabaseEnabled()) {
    const client = await sb();
    const { error } = await client.from("etsy_webhook_events").insert({ id, received_at: new Date().toISOString() });
    if (error && String(error.code) === "23505") return false;
  }
  return true;
}
