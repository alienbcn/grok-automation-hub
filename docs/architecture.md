# Architecture

Etsy path (no VPS):

Grok -> Custom Connector -> https://<vercel>/mcp -> Hub tools -> Etsy Open API v3 -> shop

Tokens: Supabase (`supabase/etsy.sql`, `supabase/tiktok.sql`) or env after first OAuth.
Etsy and TikTok tables are separate.

TikTok path (no VPS, no browser):

Grok -> Custom Connector -> https://<vercel>/mcp -> Hub TikTok tools -> TikTok Open API v2 (Login Kit + inbox upload)

Browser path remains `scripts/start.mjs` + `@playwright/mcp` for sites without API.
