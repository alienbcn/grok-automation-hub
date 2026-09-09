import { handleRequest } from "../src/http/router.mjs";

export default async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const url = new URL(req.url, `${proto}://${host}`);
  const chunks = [];
  if (req.method !== "GET" && req.method !== "HEAD") {
    for await (const c of req) chunks.push(c);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const out = await handleRequest({
    method: req.method,
    url,
    headers: req.headers,
    body,
  });
  res.statusCode = out.status;
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  res.end(out.body ?? "");
}
