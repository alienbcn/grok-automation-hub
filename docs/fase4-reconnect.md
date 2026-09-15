# Fase 4 — reconectar NovomartStudio

Estado al 2026-09-15:

- Cuenta Etsy: Alberto / `rnaigenesis@gmail.com` (también recibe avisos `albertosusarte@gmail.com`).
- Shop name: **NovomartStudio**.
- Identidad verificada el 11 sep 2026. Email oficial: “now finish setting up your shop”.
- CTA de Etsy: https://www.etsy.com/your/shops/me/onboarding/billing
- No hay correo de “shop is open” ni de primer listing. La tienda no está dada de baja: el onboarding no se cerró (falta pago set-up + Open shop).
- `shop_id` numérico: no existe en repo ni en env. Se guardará en Supabase `etsy_tokens.shop_id` al hacer OAuth.
- Hub producción: `etsyKeyConfigured=true`, `supabaseConfigured=true`, `allowLive=true`.
- Tokens: no hay evidencia de un OAuth live completado (callback guardaba tokens sin shop_id; no hay fila verificable desde aquí).

## Qué NO hay que recrear

No hace falta una tienda nueva ni una app Developers nueva si `grok-automations` sigue en Personal Access. Reutilizar:

- App: grok-automations
- Callback: https://grok-automation-hub.vercel.app/auth/etsy/callback
- Scopes: listings_r listings_w shops_r shops_w transactions_r transactions_w profile_r

## Pago (solo Alberto)

1. Login en Etsy con `rnaigenesis@gmail.com`.
2. Abrir https://www.etsy.com/your/shops/me/onboarding/billing
3. Tarjeta + banco (SEPA Bélgica).
4. Autorizar **set-up fee** one-time no reembolsable. Oficial: “a one-time, non-refundable shop set-up fee”. Importe en pantalla (base $15 USD / tramo $15–$29 + IVA BE 21% → ~15–18 EUR; confirmar el Total due now).
5. Pulsar **Open your shop**.
6. Inmediatamente después, en el mismo navegador: https://grok-automation-hub.vercel.app/auth/etsy y autorizar la app.
7. Comprobar GET https://grok-automation-hub.vercel.app/health → `etsyConnected=true` y `etsyShopIdKnown=true`.
8. Copiar el `shop_id` que muestra el callback a Vercel env `ETSY_SHOP_ID` (Production) y Redeploy. No es obligatorio si el callback lo guardó en Supabase.

## Env (nombres; valores secretos no van al chat)

Ya deben existir en Vercel Production:

- PUBLIC_BASE_URL=https://grok-automation-hub.vercel.app
- ETSY_REDIRECT_URI=https://grok-automation-hub.vercel.app/auth/etsy/callback
- ETSY_ALLOW_LIVE=true
- ETSY_API_KEY (secret)
- ETSY_SHARED_SECRET (secret)
- ETSY_SCOPES=listings_r listings_w shops_r shops_w transactions_r transactions_w profile_r
- ETSY_SHOP_ID (vacío hasta el paso 8)
- SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
- MCP_BEARER_TOKEN

SQL ya definido en `supabase/etsy.sql` (`etsy_tokens`, `etsy_oauth_sessions`).
