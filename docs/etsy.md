# Etsy integration

App name in Etsy Developers: `grok-automations`
Shop worked in this Hub: **NovomartStudio** (cuenta `rnaigenesis@gmail.com`).
`shop_id` numérico: aún no persistido — se escribe en `etsy_tokens.shop_id` tras OAuth cuando la tienda esté abierta.

Live API calls require `ETSY_ALLOW_LIVE=true` (ya activo en producción).

## After Vercel gives you a URL

1. Set `PUBLIC_BASE_URL=https://grok-automation-hub.vercel.app`
2. In Etsy app settings register exactly:
   - Callback: `https://grok-automation-hub.vercel.app/auth/etsy/callback`
   - Webhook (optional): `https://grok-automation-hub.vercel.app/webhooks/etsy`
3. Put `ETSY_API_KEY` and `ETSY_SHARED_SECRET` in Vercel env.
4. Open shop billing, pay the one-time set-up fee, then open `/auth/etsy` and approve.

Grok Custom Connector URL:
`https://grok-automation-hub.vercel.app/mcp`

Reconexión: ver `docs/fase4-reconnect.md`.
