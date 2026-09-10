# Fase 3 — env checklist (human)

Vercel cannot be written from this agent. Add Production vars here:
https://vercel.com/alienbcn/grok-automation-hub/settings/environment-variables

Non-secret:

- PUBLIC_BASE_URL=https://grok-automation-hub.vercel.app
- ETSY_REDIRECT_URI=https://grok-automation-hub.vercel.app/auth/etsy/callback
- ETSY_ALLOW_LIVE=true

Secret (never chat):

- ETSY_API_KEY
- ETSY_SHARED_SECRET
- MCP_BEARER_TOKEN
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

Then Redeploy. Confirm GET /health etsyKeyConfigured=true and supabaseConfigured=true.
Then open GET /auth/etsy in a browser and approve the shop.

SQL: supabase/etsy.sql (create table if not exists only).
