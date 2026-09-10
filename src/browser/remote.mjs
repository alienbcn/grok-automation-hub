/**
 * Remote browser via Browserbase + Playwright CDP.
 * Isolated from Etsy. Never used for Etsy shop actions.
 * Project is resolved from BROWSERBASE_API_KEY; project id is optional.
 */
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";

const SMOKE_URL = "https://example.com/";

export function browserbaseConfigured() {
  return Boolean(process.env.BROWSERBASE_API_KEY);
}

function missingEnv() {
  const missing = [];
  if (!process.env.BROWSERBASE_API_KEY) missing.push("BROWSERBASE_API_KEY");
  return missing;
}

export async function runSmokeTest() {
  const missing = missingEnv();
  if (missing.length) {
    return {
      ok: false,
      skipped: true,
      reason: "credentials_not_configured",
      missing,
      BROWSERBASE: "NOT CONFIGURED",
      PLAYWRIGHT: "NOT RUN",
      REMOTE_BROWSER: "NOT RUN",
      NAVIGATION: "NOT RUN",
      PAGE_TITLE: null,
      SESSION_CLOSED: "N/A",
    };
  }

  let session;
  let browser;
  const result = {
    ok: false,
    skipped: false,
    BROWSERBASE: "FAIL",
    PLAYWRIGHT: "FAIL",
    REMOTE_BROWSER: "FAIL",
    NAVIGATION: "FAIL",
    PAGE_TITLE: null,
    SESSION_CLOSED: "FAIL",
    target: SMOKE_URL,
  };

  try {
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const createOpts = {
      timeout: 60,
      browserSettings: { recordSession: false },
    };
    if (process.env.BROWSERBASE_PROJECT_ID) {
      createOpts.projectId = process.env.BROWSERBASE_PROJECT_ID;
    }
    session = await bb.sessions.create(createOpts);
    result.BROWSERBASE = "OK";
    result.sessionId = session.id;

    browser = await chromium.connectOverCDP(session.connectUrl);
    result.PLAYWRIGHT = "OK";
    result.REMOTE_BROWSER = "OK";

    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(SMOKE_URL, { waitUntil: "domcontentloaded", timeout: 25000 });
    const title = await page.title();
    result.NAVIGATION = "OK";
    result.PAGE_TITLE = title;
    result.ok = true;
  } catch (err) {
    result.error = err?.message || String(err);
    result.component = !session
      ? "BROWSERBASE"
      : result.PLAYWRIGHT !== "OK"
        ? "PLAYWRIGHT"
        : result.NAVIGATION !== "OK"
          ? "NAVIGATION"
          : "UNKNOWN";
  } finally {
    try {
      if (browser) await browser.close();
      result.SESSION_CLOSED = "OK";
    } catch (closeErr) {
      result.SESSION_CLOSED = "FAIL";
      result.closeError = closeErr?.message || String(closeErr);
    }
  }

  return result;
}
