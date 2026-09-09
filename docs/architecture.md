# Architecture

Etsy path (no VPS):

Grok -> Custom Connector -> https://<vercel>/mcp -> Hub tools -> Etsy Open API v3 -> shop

Tokens: Supabase (`supabase/etsy.sql`) or env after first OAuth.

Browser path remains `scripts/start.mjs` + `@playwright/mcp` for sites without API.
