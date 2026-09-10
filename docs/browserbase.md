# Remote browser (Browserbase + Playwright)

Use this path only when a site has no adequate official API.
Etsy always uses Open API v3 — never this browser path.

## Architecture

Grok → Hub on Vercel → Browserbase session → Playwright (`playwright-core`) over CDP → remote Chromium → public web.

Vercel orchestrates. It does not install a permanent Chromium.

## Environment (Vercel only)

- `BROWSERBASE_API_KEY`
- `BROWSERBASE_PROJECT_ID`

Do not commit values. Do not put them in GitHub.

## Smoke test

`GET /browser/smoke`

Opens `https://example.com/`, reads the document title, closes the session.
No login. No Etsy.

If env vars are missing the handler returns HTTP 412 and does not call Browserbase.

## Local Playwright MCP

`npm start` still launches `@playwright/mcp` for a local/VPS profile. That is separate from Browserbase.
