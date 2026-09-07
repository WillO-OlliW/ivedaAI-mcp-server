import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

// Deliberately trust only OpenAI's published metadata URLs. Never fetch an
// arbitrary URL supplied as client_id (including redirects to other hosts).
const clientUrl = /^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]{1,200}\/)?client\.json$/;
const callbackUrl = /^https:\/\/chatgpt\.com\/(?:connector\/oauth\/[A-Za-z0-9_-]{1,200}|connector_platform_oauth_redirect)$/;

export class ChatGPTClientResolver {
  private cache = new Map<string, { expires: number; client?: OAuthClientInformationFull }>();
  private pending = new Map<string, Promise<OAuthClientInformationFull | undefined>>();
  private window = 0;
  private attempts = 0;
  constructor(private readonly request: typeof fetch = fetch) {}

  async getClient(id: string): Promise<OAuthClientInformationFull | undefined> {
    if (!clientUrl.test(id)) return undefined;
    const now = Date.now();
    const cached = this.cache.get(id);
    if (cached && cached.expires > now) return cached.client;
    const pending = this.pending.get(id);
    if (pending) return pending;
    if (now - this.window >= 60000) { this.window = now; this.attempts = 0; }
    if (this.pending.size >= 8 || ++this.attempts > 30) return undefined;
    const work = this.resolve(id).then(client => {
      if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(id, { client, expires: Date.now() + (client ? 300000 : 10000) });
      return client;
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, work);
    return work;
  }

  private async resolve(id: string): Promise<OAuthClientInformationFull | undefined> {
    try {
      const response = await this.request(id, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) { await response.body?.cancel(); return undefined; }
      const reader = response.body?.getReader();
      if (!reader) return undefined;
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 32768) { await reader.cancel(); return undefined; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const doc = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const methods = doc.token_endpoint_auth_methods_supported ?? [doc.token_endpoint_auth_method];
      if (doc.client_id !== id || !Array.isArray(methods) || !methods.includes("none") ||
          !Array.isArray(doc.redirect_uris) || !doc.redirect_uris.length || doc.redirect_uris.length > 10 ||
          !doc.redirect_uris.every((uri: unknown) => typeof uri === "string" && callbackUrl.test(uri)) ||
          !Array.isArray(doc.grant_types) || !doc.grant_types.includes("authorization_code") ||
          !Array.isArray(doc.response_types) || !doc.response_types.includes("code")) return undefined;
      return { client_id: id, client_name: "ChatGPT", redirect_uris: [...doc.redirect_uris],
        token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
    } catch { return undefined; }
  }
}
