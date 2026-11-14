import Anthropic from "@anthropic-ai/sdk";
import { providerUrl, requireSetting } from "../lib/provider-config";
import { parseTelemSearch } from "../lib/search/telem";
const timeoutMs = 20_000;

async function verifyHttp(url: string, key: string, body?: object, accept = "application/json") {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: accept,
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return `failed (HTTP ${response.status})`;
  }
  if (accept.includes("text/event-stream")) {
    const payload = await response.text();
    const line = payload.split("\n").find((entry) => entry.startsWith("data:"));
    const reply = JSON.parse(line ? line.slice(5).trim() : payload);
    return reply.result?.serverInfo ? "passed" : "failed (MCP initialization)";
  }
  if (body) {
    const { perQuery } = parseTelemSearch(await response.json(), 1);
    const hasResults = perQuery.some((query) => query.hits.length);
    return hasResults ? "passed" : "failed (no search results)";
  }
  await response.body?.cancel();
  return "passed";
}

const probes = [
  {
    label: "Telem REST search",
    variable: "TELEM_API_KEY",
    run: (key: string) => verifyHttp(`${providerUrl("TELEM_BASE_URL")}/v1/search`, key, {
      user_input: { query: "NASA International Space Station overview" },
      search: { auto_routing: "accuracy", num_results: 1, tier: "default" },
    }),
  },
  {
    label: "Telem MCP",
    variable: "TELEM_API_KEY",
    run: (key: string) => verifyHttp(providerUrl("TELEM_MCP_URL"), key, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "proven-key-check", version: "1" },
      },
    }, "application/json, text/event-stream"),
  },
  {
    label: "Tavily key",
    variable: "TAVILY_API_KEY",
    run: (key: string) => verifyHttp(`${providerUrl("TAVILY_BASE_URL")}/usage`, key),
  },
  {
    label: "Anthropic model access",
    variable: "ANTHROPIC_API_KEY",
    async run(key: string) {
      const client = new Anthropic({ apiKey: key, baseURL: providerUrl("ANTHROPIC_BASE_URL"), maxRetries: 0, timeout: timeoutMs });
      await client.models.retrieve(requireSetting("ANTHROPIC_MODEL"));
      return "passed";
    },
  },
];

async function main() {
  const results = await Promise.all(probes.map(async ({ label, variable, run }) => {
    const key = process.env[variable]?.trim();
    if (!key) return { label, status: `missing ${variable}` };
    try {
      return { label, status: await run(key) };
    } catch (error) {
      // Provider errors can contain request details. Print only the status.
      const status = error instanceof Anthropic.APIError && error.status
        ? `failed (HTTP ${error.status})`
        : error instanceof Error && error.message.startsWith("Set ")
          ? error.message
          : "failed (request, response, or timeout)";
      return { label, status };
    }
  }));

  for (const { label, status } of results) console.log(`${label}: ${status}`);
  if (results.some(({ status }) => status !== "passed")) process.exitCode = 1;
}

void main();
