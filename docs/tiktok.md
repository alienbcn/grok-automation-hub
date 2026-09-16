# TikTok integration (Login Kit + Content Posting API)

Official TikTok APIs only. No scraping, Playwright, or browser login.
Target creator: **@albertosusarte**. Inbox drafts only — **not** public publish.

Live token exchange and API calls require `TIKTOK_ALLOW_LIVE=true`.

## What this Hub does

- Login Kit (web OAuth) to connect @albertosusarte
- Read user.info (basic / profile / stats)
- Upload a **draft** to the creator inbox (`video.upload`, `PULL_FROM_URL`)
- Poll publish status for that `publish_id`

## What this Hub does not do

- `video.publish` is never requested
- Direct public posting is never called (`/v2/post/publish/video/init/` is unused)
- No RPM, revenue, shop, or invented analytics

## Redirect URI

Register **exactly** this in TikTok Developers (Login Kit for Web):

`https://grok-automation-hub.vercel.app/auth/tiktok/callback`

Hub routes:

- `GET /auth/tiktok` — 302 to TikTok authorize
- `GET /auth/tiktok/callback` — state check, token exchange, username/open_id gate
- MCP tool `tiktok_oauth_start` — returns the same authorize URL as JSON

## Scopes

```
user.info.basic,user.info.profile,user.info.stats,video.list,video.upload
```

`video.publish` is stripped if present in `TIKTOK_SCOPES`.

## OAuth (web)

1. `GET https://www.tiktok.com/v2/auth/authorize/` with `client_key`, comma-separated `scope`, `response_type=code`, `redirect_uri`, `state`
2. Web apps typically **do not** send PKCE (`code_verifier` is for mobile/desktop). `state` is stored in Supabase `tiktok_oauth_sessions`.
3. `POST https://open.tiktokapis.com/v2/oauth/token/` (`application/x-www-form-urlencoded`)
   - code: `client_key`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri`
   - refresh: `client_key`, `client_secret`, `grant_type=refresh_token`, `refresh_token`
4. Callback fetches user.info when possible. If `username` is present and not `albertosusarte`, tokens are **not** saved. If `TIKTOK_EXPECTED_OPEN_ID` is set and differs, tokens are **not** saved.

## Inbox draft upload

`POST https://open.tiktokapis.com/v2/post/publish/inbox/video/init/`

```json
{
  "source_info": {
    "source": "PULL_FROM_URL",
    "video_url": "https://example.verified.domain.com/video.mp4"
  }
}
```

Returns `publish_id`. The creator finishes the post in the TikTok app via inbox notification (`SEND_TO_USER_INBOX`).

**PULL_FROM_URL requires the URL prefix/domain to be verified** in TikTok Developers.

Vercel serverless bodies are small — do **not** send video bytes or huge base64 through MCP. Host the file on a verified HTTPS URL.

## Publish status

Official: `POST https://open.tiktokapis.com/v2/post/publish/status/fetch/`

```json
{ "publish_id": "v_inbox_file~..." }
```

Authorization: `Bearer {access_token}`. Scope: `video.upload` (or `video.publish`, which this Hub does not use).

Statuses include `PROCESSING_DOWNLOAD`, `SEND_TO_USER_INBOX`, `PUBLISH_COMPLETE` (user posted from inbox), `FAILED`.

## Persistence

Supabase tables in `supabase/tiktok.sql` (separate from Etsy):

- `tiktok_oauth_sessions`
- `tiktok_tokens` (single row `id=default`)

Memory Map is a local fallback only. Production must use Supabase (Vercel instances do not share memory).

Tokens are never logged. `tiktok_status` and `/health` only expose booleans and username.

## Env

See `.env.example`. Secrets stay in Vercel — never in git or chat.

After first successful OAuth, copy `open_id` into `TIKTOK_EXPECTED_OPEN_ID` so a different TikTok account cannot overwrite tokens.
