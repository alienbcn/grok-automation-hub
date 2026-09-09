# Etsy integration

App name in Etsy Developers: `grok-automations`
Status: Pending Personal Approval — live API calls are gated (`ETSY_ALLOW_LIVE`).

## After Vercel gives you a URL

1. Set `PUBLIC_BASE_URL=https://YOUR-DEPLOY.vercel.app`
2. In Etsy app settings register exactly:
   - Callback: `https://YOUR-DEPLOY.vercel.app/auth/etsy/callback`
   - Webhook (optional): `https://YOUR-DEPLOY.vercel.app/webhooks/etsy`
3. Put `ETSY_API_KEY` and `ETSY_SHARED_SECRET` in Vercel env.
4. When Etsy approval arrives, set `ETSY_ALLOW_LIVE=true` and open `/auth/etsy`.

Grok Custom Connector URL:
`https://YOUR-DEPLOY.vercel.app/mcp`
