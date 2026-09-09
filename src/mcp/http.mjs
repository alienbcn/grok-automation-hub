import { ETSY_TOOLS } from "../etsy/tools.mjs";

function json(status, data, extra = {}) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
    body: JSON.stringify(data),
  };
}

function rpcResult(id, result) {
  return json(200, { jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id, code, message) {
  return json(200, { jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

export async function handleMcp({ method, headers, body }) {
  const token = process.env.MCP_BEARER_TOKEN;
  if (token) {
    const auth = headers.authorization || headers.Authorization || "";
    if (auth !== `Bearer ${token}`) return json(401, { error: "unauthorized" });
  }
  if (method === "GET") {
    return json(200, {
      name: "grok-automation-hub-etsy",
      transport: "http",
      tools: ETSY_TOOLS.map((t) => t.name),
    });
  }
  if (method !== "POST") return json(405, { error: "method_not_allowed" });
  let msg;
  try {
    msg = JSON.parse(body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const { id, method: rpc, params } = msg;
  if (rpc === "initialize") {
    return rpcResult(id, {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "grok-automation-hub-etsy", version: "0.2.0" },
    });
  }
  if (rpc === "notifications/initialized") return json(204, {});
  if (rpc === "tools/list") {
    return rpcResult(id, {
      tools: ETSY_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }
  if (rpc === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};
    const tool = ETSY_TOOLS.find((t) => t.name === name);
    if (!tool) return rpcError(id, -32601, `Unknown tool ${name}`);
    try {
      const result = await tool.handler(args);
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (e) {
      return rpcResult(id, {
        isError: true,
        content: [{ type: "text", text: String(e.message || e) }],
      });
    }
  }
  if (rpc === "ping") return rpcResult(id, {});
  return rpcError(id, -32601, `Unknown method ${rpc}`);
}
