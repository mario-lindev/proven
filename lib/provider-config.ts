type ProviderUrl = "TELEM_BASE_URL" | "TELEM_MCP_URL" | "TAVILY_BASE_URL" | "ANTHROPIC_BASE_URL";
type Setting = ProviderUrl | "TELEM_API_KEY" | "TAVILY_API_KEY" | "ANTHROPIC_API_KEY" | "ANTHROPIC_MODEL";

export function requireSetting(name: Setting): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in .env.local or in the server environment.`);
  return value;
}

export function providerUrl(name: ProviderUrl): string {
  const value = requireSetting(name);
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" && !url.username && !url.password &&
      !url.search && !url.hash
    ) {
      return url.href.replace(/\/+$/, "");
    }
  } catch {
    // Report the setting name without printing its value.
  }
  throw new Error(`Set ${name} to a valid HTTPS provider URL.`);
}
