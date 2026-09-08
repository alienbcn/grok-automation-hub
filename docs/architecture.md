# Architecture

Grok Chat -> Custom MCP Connector (HTTPS /mcp) -> Hub -> official @playwright/mcp -> Chrome -> web

Vercel is not for persistent Chrome. Use a VPS + Docker for 24/7.
