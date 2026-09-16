# Grok Automation Hub

Tracks:

1. **Etsy Open API v3** (priority) — HTTP MCP on Vercel. No VPS. Never Playwright for Etsy.
2. **TikTok Login Kit + Content Posting API** — official OAuth and inbox draft upload only. Never Playwright for TikTok. No `video.publish`.
3. **Remote browser** — Browserbase + Playwright CDP when a site has no adequate API.
4. **Local Playwright MCP** (optional) — `npm start` on a machine that can run Chromium.

Etsy app: `grok-automations`. Code will not call Etsy until `ETSY_ALLOW_LIVE=true`.
TikTok live calls require `TIKTOK_ALLOW_LIVE=true`. Target account: `@albertosusarte`.

## Endpoints

- `/mcp` — Grok Custom Connector (Etsy + TikTok tools)
- `/auth/etsy` — start OAuth + PKCE
- `/auth/etsy/callback` — register this exact URI in Etsy
- `/auth/tiktok` — start TikTok Login Kit (web)
- `/auth/tiktok/callback` — register this exact URI in TikTok Developers
- `/webhooks/etsy` — ORDER events (POST)
- `/health`
- `/browser/smoke` — non-destructive Browserbase + Playwright check

See `docs/etsy.md`, `docs/tiktok.md`, and `docs/browserbase.md`.
