import http from "node:http";
import { handleRequest } from "../src/http/router.mjs";

const port = Number(process.env.PORT || 3000);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const out = await handleRequest({
    method: req.method,
    url,
    headers: req.headers,
    body: Buffer.concat(chunks).toString("utf8"),
  });
  res.writeHead(out.status, out.headers);
  res.end(out.body ?? "");
});
server.listen(port, () => console.log(`[etsy-http] http://localhost:${port}`));
