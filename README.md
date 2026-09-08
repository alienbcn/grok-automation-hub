# Grok Automation Hub

Nucleo de automatizacion: Grok habla con este servidor MCP; el navegador lo mueve el Playwright MCP oficial.

```
Grok -> Custom Connector -> https://TU-DOMINIO/mcp
    -> @playwright/mcp -> Chrome/Chromium -> web
```

## Fase 1

Solo TodoMVC. Tools core unicamente.

## Local

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm start
```

Endpoint: `http://localhost:8931/mcp`
