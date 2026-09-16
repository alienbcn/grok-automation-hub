import {
  getTikTokUserInfo,
  getTikTokStats,
  initInboxVideo,
  fetchPublishStatus,
  tiktokLiveAllowed,
} from "./client.mjs";
import { getTikTokTokens } from "../store/tiktok-tokens.mjs";
import {
  createTikTokAuthorizeSession,
  checkTikTokAccount,
  expectedTikTokUsername,
  defaultTikTokScopes,
} from "./oauth.mjs";

const SECRET_KEY = /^(access_token|refresh_token|client_secret|client_key|secret|verifier|authorization)$/i;

export function stripSecrets(value, key = "") {
  if (SECRET_KEY.test(key) && typeof value === "string") return "[redacted]";
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripSecrets(v, k);
    return out;
  }
  return value;
}

export function safeTikTokStatus(tokens) {
  const now = Date.now();
  const expired = Boolean(tokens?.expiresAt && tokens.expiresAt <= now);
  const tokenValid = Boolean(tokens?.accessToken && !expired);
  return {
    connected: Boolean(tokens?.accessToken),
    username: tokens?.username || null,
    openIdPresent: Boolean(tokens?.openId),
    scopes: tokens?.scopes || "",
    tokenValid,
    tokenExpired: expired,
    refreshAvailable: Boolean(tokens?.refreshToken),
    live: tiktokLiveAllowed(),
    keyConfigured: Boolean(process.env.TIKTOK_CLIENT_KEY),
    secretConfigured: Boolean(process.env.TIKTOK_CLIENT_SECRET),
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    expectedUsername: expectedTikTokUsername(),
    requestedScopes: defaultTikTokScopes(),
    publicPublish: false,
  };
}

function userFromInfo(result) {
  return result?.data?.data?.user || result?.data?.user || null;
}

function accountGateError(check) {
  return {
    ok: false,
    status: 403,
    error: {
      code: check.reason,
      message: check.message,
      expectedUsername: check.expectedUsername,
      actualUsername: check.actualUsername || null,
    },
  };
}

export const TIKTOK_TOOLS = [
  {
    name: "tiktok_status",
    description: "Check TikTok Login Kit connection (no secrets, no tokens).",
    inputSchema: { type: "object", properties: {} },
    handler: async () => safeTikTokStatus(await getTikTokTokens()),
  },
  {
    name: "tiktok_oauth_start",
    description: "Build the official TikTok Login Kit authorize URL. Open it as @albertosusarte. Does not publish.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const session = await createTikTokAuthorizeSession();
      if (session.error) return { ok: false, ...session };
      return {
        ok: true,
        authorizeUrl: session.authorizeUrl,
        redirectUri: session.redirectUri,
        scopes: session.scopes,
        expectedUsername: session.expectedUsername,
        instructions:
          "Open authorizeUrl in a browser while logged into TikTok as @albertosusarte, approve scopes, then return to /auth/tiktok/callback. Inbox draft upload only — video.publish is not requested.",
      };
    },
  },
  {
    name: "tiktok_user_info",
    description: "Official TikTok user.info for the connected account. Rejects username/open_id mismatch vs albertosusarte.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const result = await getTikTokUserInfo();
      if (result.gated) return result;
      if (!result.ok) return result;
      const user = userFromInfo(result);
      const check = checkTikTokAccount({
        openId: user?.open_id,
        username: user?.username,
      });
      if (check.mismatch) return accountGateError(check);
      return { ok: true, user: user || result.data };
    },
  },
  {
    name: "tiktok_stats",
    description: "Official TikTok stats only: follower_count, following_count, likes_count, video_count. No revenue fields.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const result = await getTikTokStats();
      if (result.gated) return result;
      if (!result.ok) return result;
      const user = userFromInfo(result) || {};
      const check = checkTikTokAccount({
        openId: user.open_id,
        username: user.username,
      });
      if (check.mismatch) return accountGateError(check);
      return {
        ok: true,
        username: user.username || null,
        follower_count: user.follower_count ?? null,
        following_count: user.following_count ?? null,
        likes_count: user.likes_count ?? null,
        video_count: user.video_count ?? null,
      };
    },
  },
  {
    name: "tiktok_upload_draft",
    description:
      "Inbox draft via Content Posting API PULL_FROM_URL (video.upload). Returns publish_id. Does NOT publish publicly. video_url domain must be verified in TikTok Developers. Avoid base64 (Vercel body limits).",
    inputSchema: {
      type: "object",
      properties: {
        video_url: { type: "string", description: "HTTPS URL of the video. Domain/prefix must be verified with TikTok." },
      },
      required: ["video_url"],
    },
    handler: async ({ video_url, file_base64 }) => {
      if (file_base64) {
        return {
          ok: false,
          status: 400,
          error: {
            message: "file_base64 is not supported. Use video_url (PULL_FROM_URL). Vercel request bodies cannot carry large video payloads.",
          },
        };
      }
      const result = await initInboxVideo({ video_url });
      if (result.gated) return result;
      if (!result.ok) return result;
      const data = result.data?.data || result.data || {};
      return {
        ok: true,
        publish_id: data.publish_id || null,
        publicPublish: false,
        mode: "inbox_draft",
        note: "Draft is sent to the creator inbox. Complete the post in the TikTok app. This is not a public publish.",
      };
    },
  },
  {
    name: "tiktok_publish_status",
    description: "Fetch Content Posting API status for a publish_id (POST /v2/post/publish/status/fetch/). Inbox drafts typically reach SEND_TO_USER_INBOX.",
    inputSchema: {
      type: "object",
      properties: {
        publish_id: { type: "string" },
      },
      required: ["publish_id"],
    },
    handler: async ({ publish_id }) => {
      const result = await fetchPublishStatus(publish_id);
      if (result.gated) return result;
      return result;
    },
  },
];
