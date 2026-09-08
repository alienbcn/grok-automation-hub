#!/usr/bin/env node
/**
 * Launches official @playwright/mcp in HTTP mode.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "8931";
const host = process.env.HOST || "0.0.0.0";
const browser = process.env.BROWSER || "chrome";
const headless = String(process.env.HEADLESS || "false") === "true";
const userDataDir =
  process.env.USER_DATA_DIR || path.join(root, ".playwright-profile");
const viewport = process.env.VIEWPORT_SIZE || "1280x720";
const allowedHosts = process.env.ALLOWED_HOSTS || "*";
const shared = String(process.env.SHARED_BROWSER_CONTEXT || "true") === "true";
const caps = process.env.PLAYWRIGHT_MCP_CAPS || "";

fs.mkdirSync(userDataDir, { recursive: true });

const args = [
  "@playwright/mcp@latest",
  "--port", String(port),
  "--host", host,
  "--browser", browser,
  "--user-data-dir", userDataDir,
  "--viewport-size", viewport,
  "--allowed-hosts", allowedHosts,
];
if (headless) args.push("--headless");
if (shared) args.push("--shared-browser-context");
if (caps) args.push("--caps", caps);

console.log("[hub] official Playwright MCP");
console.log(`[hub] http://${host}:${port}/mcp`);
console.log(`[hub] profile ${userDataDir} headed=${!headless} browser=${browser}`);

const child = spawn("npx", ["-y", ...args], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
