# Architecture

Tres capas. Oracle no sustituye a Vercel ni a Supabase.

```
Grok / Alberto
    |
    +-- HTTPS publico --> Vercel (grok-automation-hub)
    |                      /mcp  /auth/etsy  /webhooks/etsy  /health
    |                      Etsy Open API v3 (nunca Playwright para Etsy)
    |
    +-- Tailscale -------> Oracle Always Free ARM (alienbcn-core)
    |                      OpenClaw gateway 24/7
    |                      Playwright / jobs de panel (Hotmart, KDP, Gumroad)
    |                      cron, backups, staging de packs
    |
    +-- API -------------> Supabase (tokens y estado)
```

## Qué vive dónde

| Capa | Rol |
|---|---|
| Vercel Hobby | Edge público. Callback OAuth estable. MCP HTTP. |
| Oracle ARM 4 OCPU / 24 GB | Caja general 24/7. No es un worker «de Etsy». |
| Supabase | `etsy_tokens`, sesiones OAuth, estado. |
| Browserbase | Fallback de browser si ARM no basta. |

## Reglas

- Etsy write por API oficial del Hub. `ETSY_PUBLISH_OK=false` hasta luz verde.
- Oracle no expone 22/80/443 a Internet. Ingress = Tailscale UDP 41641.
- Publicar listing o subir producto final a un canal = solo Alberto.
- Secretos nunca en el repo ni en cloud-init.

Detalle de la VM: `docs/oracle-core.md`.
