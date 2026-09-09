import crypto from "node:crypto";
import { rememberWebhookEvent } from "../store/tokens.mjs";

function json(status, data) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(data),
  };
}

export async function handleEtsyWebhook({ headers, body }) {
  const secret = process.env.ETSY_WEBHOOK_SECRET;
  const sig = headers["webhook-signature"] || headers["x-etsy-signature"];
  if (secret && sig) {
    const digest = crypto.createHmac("sha256", secret).update(body || "").digest("base64");
    const a = Buffer.from(String(sig));
    const b = Buffer.from(digest);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return json(401, { error: "invalid_signature" });
    }
  }
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const eventId =
    payload.id || payload.event_id || headers["webhook-id"] || crypto.createHash("sha256").update(body || "").digest("hex");
  const fresh = await rememberWebhookEvent(String(eventId));
  if (!fresh) return json(200, { ok: true, duplicate: true });
  return json(200, {
    ok: true,
    received: payload.event_type || payload.type || "unknown",
    note: "Stored/ack only. Automations not enabled in phase 1.",
  });
}
