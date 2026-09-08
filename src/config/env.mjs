export function loadConfig() {
  return {
    port: Number(process.env.PORT || 8931),
    host: process.env.HOST || "0.0.0.0",
    browser: process.env.BROWSER || "chrome",
    headless: String(process.env.HEADLESS || "false") === "true",
    userDataDir: process.env.USER_DATA_DIR || "./.playwright-profile",
    mcpPath: "/mcp",
  };
}
