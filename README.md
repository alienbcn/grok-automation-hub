# Grok Automation Hub

Two tracks:

1. **Etsy Open API v3** (priority) — HTTP MCP on Vercel. No VPS.
2. **Playwright MCP** (optional) — browser only when there is no API.

Etsy app: `grok-automations` (Pending Personal Approval). Code will not call Etsy until `ETSY_ALLOW_LIVE=true`.

## Etsy endpoints (after Vercel)

- `/mcp` — Grok Custom Connector
- `/auth/etsy` — start OAuth + PKCE
- `/auth/etsy/callback` — register this exact URI in Etsy
- `/webhooks/etsy` — ORDER events
- `/health`

See `docs/etsy.md`.
