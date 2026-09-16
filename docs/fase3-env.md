# Fase 3 — env checklist (human)

Vercel Production vars:
https://vercel.com/alienbcn/grok-automation-hub/settings/environment-variables

Non-secret:

- PUBLIC_BASE_URL=https://grok-automation-hub.vercel.app
- ETSY_REDIRECT_URI=https://grok-automation-hub.vercel.app/auth/etsy/callback
- ETSY_ALLOW_LIVE=true
- ETSY_PUBLISH_OK=false

`ETSY_PUBLISH_OK=true` is the only switch that allows PATCH state=active.
Leave it false until Alberto explicitly approves a publish.

Secret (never chat):

- ETSY_API_KEY
- ETSY_SHARED_SECRET
- MCP_BEARER_TOKEN
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

Optional after first OAuth:

- ETSY_SHOP_ID

Then Redeploy. Confirm GET /health etsyKeyConfigured=true and supabaseConfigured=true.
Then open GET /auth/etsy in a browser and approve the shop.

SQL: supabase/etsy.sql (create table if not exists only).

Uploads: prefer file_url over file_base64. Vercel Hobby request bodies are small; fetch-from-URL then POST to Etsy avoids stuffing a 20MB PDF through MCP.

## TikTok (separate from Etsy)

Non-secret:

- TIKTOK_REDIRECT_URI=https://grok-automation-hub.vercel.app/auth/tiktok/callback
- TIKTOK_SCOPES=user.info.basic,user.info.profile,user.info.stats,video.list,video.upload
- TIKTOK_EXPECTED_USERNAME=albertosusarte
- TIKTOK_ALLOW_LIVE=false until Alberto approves live token exchange
- TIKTOK_EXPECTED_OPEN_ID= (set after first successful OAuth)

Secret (never chat):

- TIKTOK_CLIENT_KEY
- TIKTOK_CLIENT_SECRET

SQL: `supabase/tiktok.sql` (do not reuse etsy_* tables).
Inbox drafts: prefer `video_url` on a TikTok-verified domain. No `video.publish`. No huge base64 (Vercel body limits).
