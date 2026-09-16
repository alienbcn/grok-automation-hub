import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  saveTikTokOauthSession,
  takeTikTokOauthSession,
  saveTikTokTokens,
  getTikTokTokens,
  resetTikTokMemory,
  tokenShapeForTests,
} from "../src/store/tiktok-tokens.mjs";
import { saveTokens, getTokens } from "../src/store/tokens.mjs";
import {
  handleTikTokAuthStart,
  handleTikTokAuthCallback,
  refreshTikTokAccessToken,
  parseTikTokTokenPayload,
  checkTikTokAccount,
  defaultTikTokScopes,
  expectedTikTokUsername,
  redactTikTokPayload,
} from "../src/tiktok/oauth.mjs";
import { getTikTokUserInfo } from "../src/tiktok/client.mjs";
import { TIKTOK_TOOLS, safeTikTokStatus, stripSecrets } from "../src/tiktok/tools.mjs";
import { ETSY_TOOLS } from "../src/etsy/tools.mjs";
import { handleMcp } from "../src/mcp/http.mjs";
import { handleRequest } from "../src/http/router.mjs";

const ORIG_ENV = { ...process.env };
let origFetch = globalThis.fetch;

function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIG_ENV)) delete process.env[k];
  }
  Object.assign(process.env, ORIG_ENV);
}

function tiktokEnv(extra = {}) {
  process.env.TIKTOK_CLIENT_KEY = "test_client_key";
  process.env.TIKTOK_CLIENT_SECRET = "test_client_secret";
  process.env.TIKTOK_REDIRECT_URI = "https://grok-automation-hub.vercel.app/auth/tiktok/callback";
  process.env.TIKTOK_SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.list,video.upload";
  process.env.TIKTOK_ALLOW_LIVE = "true";
  process.env.TIKTOK_EXPECTED_USERNAME = "albertosusarte";
  delete process.env.TIKTOK_EXPECTED_OPEN_ID;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  Object.assign(process.env, extra);
}

function jsonRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

async function mcp(method, params, id = 1) {
  const out = await handleMcp({
    method: "POST",
    headers: {},
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { status: out.status, body: JSON.parse(out.body) };
}

describe("TikTok OAuth and store", () => {
  beforeEach(() => {
    restoreEnv();
    tiktokEnv();
    resetTikTokMemory();
    globalThis.fetch = origFetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    restoreEnv();
    resetTikTokMemory();
  });

  it("stores OAuth state once and rejects reuse", async () => {
    await saveTikTokOauthSession({ state: "st-1", verifier: null, createdAt: Date.now() });
    const first = await takeTikTokOauthSession("st-1");
    assert.equal(first.verifier, null);
    assert.ok(first.createdAt);
    const second = await takeTikTokOauthSession("st-1");
    assert.equal(second, null);
  });

  it("persists token shapes without exposing raw tokens via tokenShapeForTests", async () => {
    await saveTikTokTokens({
      accessToken: "act.secret-access",
      refreshToken: "rft.secret-refresh",
      openId: "oid-abc",
      username: "albertosusarte",
      scopes: "user.info.basic,video.upload",
      expiresAt: Date.now() + 60_000,
      refreshExpiresAt: Date.now() + 86_400_000,
    });
    const tokens = await getTikTokTokens();
    const shape = tokenShapeForTests(tokens);
    assert.equal(shape.hasAccessToken, true);
    assert.equal(shape.hasRefreshToken, true);
    assert.equal(shape.openId, "oid-abc");
    assert.equal(shape.username, "albertosusarte");
    assert.equal(shape.scopes, "user.info.basic,video.upload");
    assert.ok(shape.expiresAt > Date.now());
    assert.equal(JSON.stringify(shape).includes("act.secret-access"), false);
    assert.equal(JSON.stringify(shape).includes("rft.secret-refresh"), false);
  });

  it("builds authorize URL without PKCE and without video.publish", async () => {
    process.env.TIKTOK_SCOPES = "user.info.basic,video.publish,video.upload";
    const res = await handleTikTokAuthStart(new URL("https://grok-automation-hub.vercel.app/auth/tiktok"));
    assert.equal(res.status, 302);
    const loc = new URL(res.headers.Location);
    assert.equal(loc.origin + loc.pathname, "https://www.tiktok.com/v2/auth/authorize/");
    assert.equal(loc.searchParams.get("client_key"), "test_client_key");
    assert.equal(loc.searchParams.get("response_type"), "code");
    assert.equal(loc.searchParams.get("redirect_uri"), "https://grok-automation-hub.vercel.app/auth/tiktok/callback");
    assert.ok(loc.searchParams.get("state"));
    assert.equal(loc.searchParams.has("code_challenge"), false);
    assert.equal(loc.searchParams.get("scope").includes("video.publish"), false);
    assert.ok(loc.searchParams.get("scope").includes("video.upload"));
    const taken = await takeTikTokOauthSession(loc.searchParams.get("state"));
    assert.ok(taken);
  });

  it("callback rejects invalid state", async () => {
    const res = await handleTikTokAuthCallback(
      new URL("https://grok-automation-hub.vercel.app/auth/tiktok/callback?code=abc&state=nope"),
    );
    assert.equal(res.status, 400);
    assert.match(res.body, /Invalid or expired OAuth state/);
  });

  it("does not save tokens when username mismatches albertosusarte", async () => {
    await saveTikTokOauthSession({ state: "good-state", createdAt: Date.now() });
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/oauth/token/")) {
        return jsonRes(200, {
          access_token: "act.wrong-account",
          refresh_token: "rft.wrong-account",
          expires_in: 86400,
          refresh_expires_in: 31536000,
          open_id: "other-open-id",
          scope: "user.info.basic,user.info.profile",
          token_type: "Bearer",
        });
      }
      if (u.includes("/user/info/")) {
        return jsonRes(200, {
          data: { user: { open_id: "other-open-id", username: "notalberto", display_name: "Nope" } },
          error: { code: "ok", message: "" },
        });
      }
      return jsonRes(500, { error: "unexpected" });
    };
    const res = await handleTikTokAuthCallback(
      new URL("https://grok-automation-hub.vercel.app/auth/tiktok/callback?code=tiktok-code&state=good-state"),
    );
    assert.equal(res.status, 403);
    assert.match(res.body, /notalberto/);
    assert.equal(await getTikTokTokens(), null);
  });

  it("does not overwrite existing tokens on open_id mismatch", async () => {
    await saveTikTokTokens({
      accessToken: "act.keep-me",
      refreshToken: "rft.keep-me",
      openId: "expected-oid",
      username: "albertosusarte",
      scopes: "user.info.basic",
      expiresAt: Date.now() + 99_000,
    });
    process.env.TIKTOK_EXPECTED_OPEN_ID = "expected-oid";
    await saveTikTokOauthSession({ state: "st-mismatch", createdAt: Date.now() });
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/oauth/token/")) {
        return jsonRes(200, {
          access_token: "act.attacker",
          refresh_token: "rft.attacker",
          expires_in: 86400,
          open_id: "attacker-oid",
          scope: "user.info.basic",
          token_type: "Bearer",
        });
      }
      if (u.includes("/user/info/")) {
        return jsonRes(200, {
          data: { user: { open_id: "attacker-oid", username: "albertosusarte" } },
          error: { code: "ok" },
        });
      }
      return jsonRes(500, {});
    };
    const res = await handleTikTokAuthCallback(
      new URL("https://grok-automation-hub.vercel.app/auth/tiktok/callback?code=x&state=st-mismatch"),
    );
    assert.equal(res.status, 403);
    const kept = await getTikTokTokens();
    assert.equal(kept.accessToken, "act.keep-me");
    assert.equal(kept.openId, "expected-oid");
  });

  it("parses token payloads and redacts secrets", () => {
    const parsed = parseTikTokTokenPayload({
      access_token: "act.x",
      refresh_token: "rft.y",
      expires_in: 10,
      refresh_expires_in: 20,
      open_id: "oid",
      scope: "user.info.basic",
      token_type: "Bearer",
    });
    assert.equal(parsed.accessToken, "act.x");
    assert.equal(parsed.openId, "oid");
    const redacted = redactTikTokPayload({ access_token: "act.x", nested: { refresh_token: "rft.y" } });
    assert.equal(redacted.access_token, "[redacted]");
    assert.equal(redacted.nested.refresh_token, "[redacted]");
  });

  it("strips video.publish from requested scopes", () => {
    process.env.TIKTOK_SCOPES = "user.info.basic,video.publish,video.upload";
    const scopes = defaultTikTokScopes();
    assert.equal(scopes.includes("video.publish"), false);
    assert.ok(scopes.includes("video.upload"));
  });

  it("defaults expected username to albertosusarte", () => {
    delete process.env.TIKTOK_EXPECTED_USERNAME;
    assert.equal(expectedTikTokUsername(), "albertosusarte");
    const miss = checkTikTokAccount({ username: "someoneelse" });
    assert.equal(miss.mismatch, true);
    assert.equal(miss.reason, "username_mismatch");
    const ok = checkTikTokAccount({ username: "AlbertoSusarte" });
    assert.equal(ok.mismatch, false);
  });
});

describe("TikTok refresh and status", () => {
  beforeEach(() => {
    restoreEnv();
    tiktokEnv();
    resetTikTokMemory();
    globalThis.fetch = origFetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    restoreEnv();
    resetTikTokMemory();
  });

  it("refreshes expired access tokens and keeps username", async () => {
    await saveTikTokTokens({
      accessToken: "act.old",
      refreshToken: "rft.old",
      openId: "oid-1",
      username: "albertosusarte",
      scopes: "user.info.basic,user.info.stats",
      expiresAt: Date.now() - 1000,
      refreshExpiresAt: Date.now() + 86_400_000,
    });
    globalThis.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes("/oauth/token/")) {
        const body = String(opts?.body || "");
        assert.ok(body.includes("grant_type=refresh_token"));
        assert.ok(body.includes("refresh_token=rft.old"));
        assert.equal(body.includes("act.old"), false);
        return jsonRes(200, {
          access_token: "act.new",
          refresh_token: "rft.new",
          expires_in: 86400,
          refresh_expires_in: 31536000,
          open_id: "oid-1",
          scope: "user.info.basic,user.info.stats",
          token_type: "Bearer",
        });
      }
      throw new Error("unexpected " + u);
    };
    const refreshed = await refreshTikTokAccessToken("rft.old");
    assert.equal(refreshed.accessToken, "act.new");
    assert.equal(refreshed.username, "albertosusarte");
    const stored = await getTikTokTokens();
    assert.equal(stored.accessToken, "act.new");
    assert.equal(stored.username, "albertosusarte");
  });

  it("auto-refreshes from the API client when the token is expired", async () => {
    await saveTikTokTokens({
      accessToken: "act.expired",
      refreshToken: "rft.live",
      openId: "oid-1",
      username: "albertosusarte",
      scopes: "user.info.basic",
      expiresAt: Date.now() - 5000,
    });
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/oauth/token/")) {
        return jsonRes(200, {
          access_token: "act.fresh",
          refresh_token: "rft.live",
          expires_in: 86400,
          open_id: "oid-1",
          scope: "user.info.basic",
          token_type: "Bearer",
        });
      }
      if (u.includes("/user/info/")) {
        return jsonRes(200, {
          data: { user: { open_id: "oid-1", username: "albertosusarte", display_name: "Alberto" } },
          error: { code: "ok" },
        });
      }
      return jsonRes(500, {});
    };
    const info = await getTikTokUserInfo(["open_id", "username"]);
    assert.equal(info.ok, true);
    assert.equal((await getTikTokTokens()).accessToken, "act.fresh");
  });

  it("tiktok_status never includes tokens or secrets", async () => {
    await saveTikTokTokens({
      accessToken: "act.super-secret-value",
      refreshToken: "rft.super-secret-value",
      openId: "oid-should-not-appear-as-field-leak",
      username: "albertosusarte",
      scopes: "user.info.basic,video.upload",
      expiresAt: Date.now() + 120_000,
    });
    process.env.TIKTOK_CLIENT_SECRET = "plain-client-secret";
    const statusTool = TIKTOK_TOOLS.find((t) => t.name === "tiktok_status");
    const out = await statusTool.handler({});
    assert.equal(out.connected, true);
    assert.equal(out.username, "albertosusarte");
    assert.equal(out.openIdPresent, true);
    assert.equal(out.tokenValid, true);
    assert.equal(out.tokenExpired, false);
    assert.equal(out.refreshAvailable, true);
    assert.equal(out.publicPublish, false);
    const dumped = JSON.stringify(out);
    assert.equal(dumped.includes("act.super-secret-value"), false);
    assert.equal(dumped.includes("rft.super-secret-value"), false);
    assert.equal(dumped.includes("plain-client-secret"), false);
    assert.equal(dumped.includes("test_client_key"), false);
    assert.equal("accessToken" in out, false);
    assert.equal("refreshToken" in out, false);
    assert.equal("openId" in out, false);
    assert.equal(out.openIdPresent, true);
    const stripped = stripSecrets({ access_token: "act.x", accessToken: "act.x", tokenValid: true, secretConfigured: true });
    assert.equal(stripped.access_token, "[redacted]");
    assert.equal(stripped.accessToken, "[redacted]");
    assert.equal(stripped.tokenValid, true);
    assert.equal(stripped.secretConfigured, true);
  });

  it("safeTikTokStatus marks expired tokens", async () => {
    const status = safeTikTokStatus({
      accessToken: "x",
      refreshToken: "y",
      openId: "z",
      username: "albertosusarte",
      scopes: "user.info.basic",
      expiresAt: Date.now() - 10,
    });
    assert.equal(status.tokenValid, false);
    assert.equal(status.tokenExpired, true);
    assert.equal(status.connected, true);
  });
});

describe("MCP hub coexistence", () => {
  beforeEach(() => {
    restoreEnv();
    tiktokEnv();
    resetTikTokMemory();
    process.env.ETSY_API_KEY = "etsy-test-key";
    process.env.TIKTOK_CLIENT_KEY = "tiktok-test-key";
    globalThis.fetch = origFetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    restoreEnv();
    resetTikTokMemory();
  });

  it("tools/list includes both Etsy and TikTok tools", async () => {
    const { body } = await mcp("tools/list");
    const names = body.result.tools.map((t) => t.name);
    for (const t of ETSY_TOOLS) assert.ok(names.includes(t.name), `missing ${t.name}`);
    for (const t of TIKTOK_TOOLS) assert.ok(names.includes(t.name), `missing ${t.name}`);
    assert.ok(names.includes("etsy_status"));
    assert.ok(names.includes("tiktok_status"));
    assert.ok(names.includes("tiktok_oauth_start"));
    assert.ok(names.includes("tiktok_user_info"));
    assert.ok(names.includes("tiktok_stats"));
    assert.ok(names.includes("tiktok_upload_draft"));
    assert.ok(names.includes("tiktok_publish_status"));
    assert.equal(names.includes("video.publish"), false);
  });

  it("GET /mcp names the hub not only etsy", async () => {
    const out = await handleMcp({ method: "GET", headers: {}, body: "" });
    const body = JSON.parse(out.body);
    assert.equal(body.name, "grok-automation-hub");
    assert.ok(body.tools.includes("etsy_get_shop"));
    assert.ok(body.tools.includes("tiktok_status"));
  });

  it("etsy_status still works alongside tiktok_status", async () => {
    const etsy = await mcp("tools/call", { name: "etsy_status", arguments: {} });
    const tiktok = await mcp("tools/call", { name: "tiktok_status", arguments: {} });
    const etsyText = JSON.parse(etsy.body.result.content[0].text);
    const tiktokText = JSON.parse(tiktok.body.result.content[0].text);
    assert.equal(etsyText.keyConfigured, true);
    assert.equal(tiktokText.keyConfigured, true);
    assert.equal(tiktokText.expectedUsername, "albertosusarte");
    assert.equal(JSON.stringify(tiktokText).includes("test_client_secret"), false);
  });

  it("/health reports both integrations without secrets", async () => {
    await saveTokens({
      accessToken: "etsy-secret-token",
      refreshToken: "etsy-refresh",
      expiresAt: Date.now() + 60_000,
      scopes: "listings_r",
      shopId: "123",
    });
    await saveTikTokTokens({
      accessToken: "tiktok-secret-token",
      refreshToken: "tiktok-refresh",
      openId: "oid",
      username: "albertosusarte",
      scopes: "user.info.basic",
      expiresAt: Date.now() + 60_000,
    });
    const out = await handleRequest({
      method: "GET",
      url: new URL("https://grok-automation-hub.vercel.app/health"),
      headers: {},
      body: "",
    });
    const data = JSON.parse(out.body);
    assert.equal(data.ok, true);
    assert.equal(data.etsyKeyConfigured, true);
    assert.equal(data.tiktokKeyConfigured, true);
    assert.equal(data.etsyConnected, true);
    assert.equal(data.tiktokConnected, true);
    const dumped = JSON.stringify(data);
    assert.equal(dumped.includes("etsy-secret-token"), false);
    assert.equal(dumped.includes("tiktok-secret-token"), false);
    assert.equal(dumped.includes("test_client_secret"), false);
  });

  it("tiktok_upload_draft rejects base64 payloads", async () => {
    const tool = TIKTOK_TOOLS.find((t) => t.name === "tiktok_upload_draft");
    const out = await tool.handler({ video_url: "https://cdn.example/v.mp4", file_base64: "AAAA" });
    assert.equal(out.ok, false);
    assert.match(out.error.message, /file_base64 is not supported/);
  });
});

describe("Grok audit P0–P2 fixes", () => {
  beforeEach(() => {
    restoreEnv();
    tiktokEnv();
    resetTikTokMemory();
    globalThis.fetch = origFetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    restoreEnv();
    resetTikTokMemory();
  });

  it("happy callback with username albertosusarte saves tokens; status has no access_token", async () => {
    await saveTikTokOauthSession({ state: "happy-st", createdAt: Date.now() });
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/oauth/token/")) {
        return jsonRes(200, {
          access_token: "act.happy-secret",
          refresh_token: "rft.happy-secret",
          expires_in: 86400,
          refresh_expires_in: 31536000,
          open_id: "oid-alberto",
          scope: "user.info.basic,user.info.profile,video.upload",
          token_type: "Bearer",
        });
      }
      if (u.includes("/user/info/")) {
        return jsonRes(200, {
          data: { user: { open_id: "oid-alberto", username: "albertosusarte", display_name: "Alberto" } },
          error: { code: "ok" },
        });
      }
      return jsonRes(500, { error: "unexpected" });
    };
    const res = await handleTikTokAuthCallback(
      new URL("https://grok-automation-hub.vercel.app/auth/tiktok/callback?code=ok-code&state=happy-st"),
    );
    assert.equal(res.status, 200);
    assert.match(res.body, /albertosusarte/);
    assert.equal(res.body.includes("act.happy-secret"), false);
    const tokens = await getTikTokTokens();
    assert.equal(tokens.accessToken, "act.happy-secret");
    assert.equal(tokens.username, "albertosusarte");
    const statusTool = TIKTOK_TOOLS.find((t) => t.name === "tiktok_status");
    const status = await statusTool.handler({});
    const statusDump = JSON.stringify(status);
    assert.equal(statusDump.includes("act.happy-secret"), false);
    assert.equal(statusDump.includes("access_token"), false);
    assert.equal("accessToken" in status, false);
    const mcpOut = await mcp("tools/call", { name: "tiktok_status", arguments: {} });
    assert.equal(mcpOut.body.result.content[0].text.includes("act.happy-secret"), false);
  });

  it("callback without username and without TIKTOK_EXPECTED_OPEN_ID returns 403 and does not save", async () => {
    delete process.env.TIKTOK_EXPECTED_OPEN_ID;
    await saveTikTokOauthSession({ state: "no-user-st", createdAt: Date.now() });
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/oauth/token/")) {
        return jsonRes(200, {
          access_token: "act.no-user",
          refresh_token: "rft.no-user",
          expires_in: 86400,
          open_id: "oid-unknown",
          scope: "user.info.basic",
          token_type: "Bearer",
        });
      }
      if (u.includes("/user/info/")) {
        return jsonRes(200, {
          data: { user: { open_id: "oid-unknown", display_name: "NoUsername" } },
          error: { code: "ok" },
        });
      }
      return jsonRes(500, {});
    };
    const res = await handleTikTokAuthCallback(
      new URL("https://grok-automation-hub.vercel.app/auth/tiktok/callback?code=c&state=no-user-st"),
    );
    assert.equal(res.status, 403);
    assert.match(res.body, /username unavailable|username_unavailable|TIKTOK_EXPECTED_OPEN_ID/i);
    assert.equal(await getTikTokTokens(), null);
  });

  it("TIKTOK_ALLOW_LIVE !== true does not hit token endpoint and does not save", async () => {
    process.env.TIKTOK_ALLOW_LIVE = "false";
    await saveTikTokOauthSession({ state: "gated-st", createdAt: Date.now() });
    let tokenHits = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/oauth/token/")) {
        tokenHits += 1;
        return jsonRes(200, { access_token: "should-not-save" });
      }
      return jsonRes(500, {});
    };
    const res = await handleTikTokAuthCallback(
      new URL("https://grok-automation-hub.vercel.app/auth/tiktok/callback?code=c&state=gated-st"),
    );
    assert.equal(res.status, 200);
    assert.match(res.body, /TIKTOK_ALLOW_LIVE/);
    assert.equal(tokenHits, 0);
    assert.equal(await getTikTokTokens(), null);
  });

  it("initInboxVideo / tiktok_upload_draft sends PULL_FROM_URL and video_url", async () => {
    await saveTikTokTokens({
      accessToken: "act.live",
      refreshToken: "rft.live",
      openId: "oid-1",
      username: "albertosusarte",
      scopes: "video.upload",
      expiresAt: Date.now() + 120_000,
    });
    let capturedBody = null;
    let capturedUrl = null;
    globalThis.fetch = async (url, opts) => {
      capturedUrl = String(url);
      if (opts?.body) capturedBody = JSON.parse(opts.body);
      return jsonRes(200, {
        data: { publish_id: "v_inbox_file~test123" },
        error: { code: "ok" },
      });
    };
    const tool = TIKTOK_TOOLS.find((t) => t.name === "tiktok_upload_draft");
    const out = await tool.handler({ video_url: "https://cdn.verified.example/video.mp4" });
    assert.equal(out.ok, true);
    assert.equal(out.publish_id, "v_inbox_file~test123");
    assert.ok(capturedUrl.includes("/v2/post/publish/inbox/video/init/"));
    assert.equal(capturedBody.source_info.source, "PULL_FROM_URL");
    assert.equal(capturedBody.source_info.video_url, "https://cdn.verified.example/video.mp4");
  });

  it("rejects http:// and empty video_url for inbox init", async () => {
    await saveTikTokTokens({
      accessToken: "act.live",
      refreshToken: "rft.live",
      openId: "oid-1",
      username: "albertosusarte",
      scopes: "video.upload",
      expiresAt: Date.now() + 120_000,
    });
    let fetchHits = 0;
    globalThis.fetch = async () => {
      fetchHits += 1;
      return jsonRes(200, { data: { publish_id: "nope" }, error: { code: "ok" } });
    };
    const tool = TIKTOK_TOOLS.find((t) => t.name === "tiktok_upload_draft");
    const httpOut = await tool.handler({ video_url: "http://cdn.example/v.mp4" });
    assert.equal(httpOut.ok, false);
    assert.equal(httpOut.status, 400);
    const emptyOut = await tool.handler({ video_url: "" });
    assert.equal(emptyOut.ok, false);
    assert.equal(emptyOut.status, 400);
    assert.equal(fetchHits, 0);
  });

  it("propagates url_ownership_unverified from TikTok inbox init", async () => {
    await saveTikTokTokens({
      accessToken: "act.live",
      refreshToken: "rft.live",
      openId: "oid-1",
      username: "albertosusarte",
      scopes: "video.upload",
      expiresAt: Date.now() + 120_000,
    });
    globalThis.fetch = async () =>
      jsonRes(403, {
        error: { code: "url_ownership_unverified", message: "The domain is not verified" },
      });
    const tool = TIKTOK_TOOLS.find((t) => t.name === "tiktok_upload_draft");
    const out = await tool.handler({ video_url: "https://unverified.example/v.mp4" });
    assert.equal(out.ok, false);
    assert.equal(out.error.code, "url_ownership_unverified");
    assert.match(out.error.hint || "", /URL properties|propiedad verificada/i);
  });

  it("tiktok_publish_status POSTs /v2/post/publish/status/fetch/ with publish_id", async () => {
    await saveTikTokTokens({
      accessToken: "act.live",
      refreshToken: "rft.live",
      openId: "oid-1",
      username: "albertosusarte",
      scopes: "video.upload",
      expiresAt: Date.now() + 120_000,
    });
    let capturedUrl = null;
    let capturedBody = null;
    let capturedMethod = null;
    globalThis.fetch = async (url, opts) => {
      capturedUrl = String(url);
      capturedMethod = opts?.method || "GET";
      if (opts?.body) capturedBody = JSON.parse(opts.body);
      return jsonRes(200, {
        data: { status: "SEND_TO_USER_INBOX" },
        error: { code: "ok" },
      });
    };
    const tool = TIKTOK_TOOLS.find((t) => t.name === "tiktok_publish_status");
    const out = await tool.handler({ publish_id: "v_inbox_file~abc" });
    assert.equal(out.ok, true);
    assert.equal(capturedMethod, "POST");
    assert.ok(capturedUrl.includes("/v2/post/publish/status/fetch/"));
    assert.deepEqual(capturedBody, { publish_id: "v_inbox_file~abc" });
  });

  it("tiktok_stats with username otra returns 403", async () => {
    await saveTikTokTokens({
      accessToken: "act.live",
      refreshToken: "rft.live",
      openId: "oid-other",
      username: "otra",
      scopes: "user.info.stats",
      expiresAt: Date.now() + 120_000,
    });
    globalThis.fetch = async (url) => {
      if (String(url).includes("/user/info/")) {
        return jsonRes(200, {
          data: {
            user: {
              open_id: "oid-other",
              username: "otra",
              follower_count: 99,
              following_count: 1,
              likes_count: 2,
              video_count: 3,
            },
          },
          error: { code: "ok" },
        });
      }
      return jsonRes(500, {});
    };
    const tool = TIKTOK_TOOLS.find((t) => t.name === "tiktok_stats");
    const out = await tool.handler({});
    assert.equal(out.ok, false);
    assert.equal(out.status, 403);
    assert.equal(out.error.code, "username_mismatch");
    assert.equal(out.error.expectedUsername, "albertosusarte");
    assert.equal(out.error.actualUsername, "otra");
    assert.equal("follower_count" in out, false);
  });

  it("MCP tools/call redacts access_token via stripSecrets", async () => {
    const tool = TIKTOK_TOOLS.find((t) => t.name === "tiktok_status");
    const orig = tool.handler;
    tool.handler = async () => ({
      ok: true,
      access_token: "act.leaked-from-handler",
      nested: { refresh_token: "rft.also-leaked" },
      tokenValid: true,
    });
    try {
      const { body } = await mcp("tools/call", { name: "tiktok_status", arguments: {} });
      const text = body.result.content[0].text;
      assert.equal(text.includes("act.leaked-from-handler"), false);
      assert.equal(text.includes("rft.also-leaked"), false);
      assert.ok(text.includes("[redacted]"));
      const parsed = JSON.parse(text);
      assert.equal(parsed.access_token, "[redacted]");
      assert.equal(parsed.nested.refresh_token, "[redacted]");
      assert.equal(parsed.tokenValid, true);
    } finally {
      tool.handler = orig;
    }
  });

  it("MCP tools/call redacts camelCase accessToken via stripSecrets", async () => {
    const tool = TIKTOK_TOOLS.find((t) => t.name === "tiktok_status");
    const orig = tool.handler;
    tool.handler = async () => ({
      ok: true,
      accessToken: "act.x",
      tokenValid: true,
      secretConfigured: true,
    });
    try {
      const { body } = await mcp("tools/call", { name: "tiktok_status", arguments: {} });
      const text = body.result.content[0].text;
      assert.equal(text.includes("act.x"), false);
      const parsed = JSON.parse(text);
      assert.equal(parsed.accessToken, "[redacted]");
      assert.equal(parsed.tokenValid, true);
      assert.equal(parsed.secretConfigured, true);
    } finally {
      tool.handler = orig;
    }
  });
});
