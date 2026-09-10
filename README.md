# Grok Automation Hub

Two tracks:

1. **Etsy Open API v3** (priority) — HTTP MCP on Vercel. No VPS. Never Playwright for Etsy.
2. **Remote browser** — Browserbase + Playwright CDP when a site has no adequate API.
3. **Local Playwright MCP** (optional) — `npm start` on a machine that can run Chromium.

Etsy app: `grok-automations`. Code will not call Etsy until `ETSY_ALLOW_LIVE=true`.

## Endpoints

- `/mcp` — Grok Custom Connector (Etsy tools)
- `/auth/etsy` — start OAuth + PKCE
- `/auth/etsy/callback` — register this exact URI in Etsy
- `/webhooks/etsy` — ORDER events (POST)
- `/health`
- `/browser/smoke` — non-destructive Browserbase + Playwright check

See `docs/etsy.md` and `docs/browserbase.md`.
