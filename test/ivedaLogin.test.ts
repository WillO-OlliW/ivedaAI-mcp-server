import { createServer, request, type Server, type ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createIvedaLoginServer, ivedaLoginConfigSchema, type IvedaLoginConfig } from "../src/ivedaLogin.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const config: IvedaLoginConfig = {
  auth: "ivedaai", publicUrl: "https://mcp.customer.example/mcp", upstreamOrigin: "https://iveda.customer.example", port: 3000,
  clients: [{ clientId: "approved-ai", name: "Approved AI", redirectUris: ["https://ai.example/callback"] },
    { clientId: "other-ai", name: "Other AI", redirectUris: ["https://other.example/callback"] }],
};
let upstream: Server;
let service: ReturnType<typeof createIvedaLoginServer>;
let base: string;
let logins: string[];
let disabled = false;
let writes: { method: string; url: string; owner: string }[];
let held: Map<string, Set<ServerResponse>>;
async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
beforeEach(async () => {
  logins = []; disabled = false; writes = []; held = new Map();
  upstream = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.endsWith("/oauth2/token")) {
      let body = ""; for await (const chunk of req) body += chunk;
      const fields = new URLSearchParams(body), username = fields.get("username")!;
      logins.push(username);
      if (disabled || !["alice", "bob", "charlie", "dana", "erin"].includes(username) || fields.get("password") !== "fixture-password") {
        res.writeHead(400); res.end(JSON.stringify({ error: "private upstream diagnostic must not be exposed" }));
      } else res.end(JSON.stringify({ access_token: `upstream-${username}`, expires_in: 3600, token_type: "Bearer" }));
    } else {
      const owner = req.headers.authorization?.replace("Bearer upstream-", "") ?? "";
      if (req.method === "GET" && req.url?.endsWith("/cameras/44")) {
        const requests = held.get(owner) ?? new Set<ServerResponse>();
        held.set(owner, requests); requests.add(res);
        res.once("close", () => requests.delete(res));
        return;
      }
      if (req.method !== "GET") {
        if (owner === "bob") { res.writeHead(403); res.end(JSON.stringify({ error: "Account cannot change cameras" })); return; }
        writes.push({ method: req.method!, url: req.url!, owner });
      }
      res.end(JSON.stringify({ cameraId: 1, owner }));
    }
  });
  const origin = await listen(upstream);
  service = createIvedaLoginServer({ ...config, upstreamOrigin: origin });
  base = await listen(service.http);
});
afterEach(async () => {
  vi.restoreAllMocks(); await service.close();
  await new Promise<void>(resolve => { upstream.close(() => resolve()); upstream.closeAllConnections(); });
});
async function form(path: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  return fetch(base + path, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(fields) });
}
async function start(extra: Record<string, string> = {}) {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const response = await fetch(base + "/authorize?" + new URLSearchParams({ client_id: "approved-ai", redirect_uri: config.clients[0].redirectUris[0],
    response_type: "code", code_challenge_method: "S256", code_challenge: challenge, resource: config.publicUrl,
    scope: "ivedaai:read", state: "client-state", ...extra }), { redirect: "manual" });
  const html = await response.text();
  return { response, html, verifier, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    flow: /name="flow" value="([^"]+)"/.exec(html)?.[1] ?? "", csrf: /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? "" };
}
type Flow = Awaited<ReturnType<typeof start>>;
async function login(flow: Flow, fields: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return form("/login", { flow: flow.flow, csrf: flow.csrf, username: "alice", password: "fixture-password", consent: "yes", ...fields },
    { cookie: flow.cookie, origin: new URL(config.publicUrl).origin, ...headers });
}
async function exchange(flow: Flow, code: string, extra: Record<string, string> = {}) {
  return form("/token", { client_id: "approved-ai", grant_type: "authorization_code", code, code_verifier: flow.verifier,
    redirect_uri: config.clients[0].redirectUris[0], resource: config.publicUrl, ...extra });
}
async function linked(username = "alice", write = false) {
  const flow = await start(write ? { scope: "ivedaai:read ivedaai:write" } : {}); expect(flow.response.status).toBe(200);
  const response = await login(flow, { username, ...(write ? { writeConsent: "yes" } : {}) }); expect(response.status).toBe(303);
  const redirect = new URL(response.headers.get("location")!);
  const tokenResponse = await exchange(flow, redirect.searchParams.get("code")!);
  expect(tokenResponse.status).toBe(200);
  return { flow, redirect, tokens: await tokenResponse.json() };
}
async function discover(token: string) {
  return fetch(base + "/mcp", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
}

function holdCamera(token: string) {
  const controller = new AbortController();
  const result = fetch(base + "/mcp", { method: "POST", signal: controller.signal,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 44, method: "tools/call", params: { name: "ivedaai_camera",
      arguments: { operation: "GET /api/cameras/{cameraId}", path: { cameraId: 44 } } } }),
  }).then(async response => { await response.text(); return response.status; }).catch(() => 0);
  return { controller, result };
}

describe("native login under concurrent load", () => {
  it("shares the account limit across grants and releases capacity after cancellation", async () => {
    const first = await linked(), second = await linked(), bob = await linked("bob");
    const pending = Array.from({ length: 4 }, () => holdCamera(first.tokens.access_token));
    try {
      await vi.waitFor(() => expect(held.get("alice")?.size).toBe(4));
      const before = logins.length;
      expect((await discover(second.tokens.access_token)).status).toBe(429);
      expect((await discover(bob.tokens.access_token)).status).toBe(200);
      expect(logins).toHaveLength(before);
    } finally {
      pending.forEach(p => p.controller.abort()); await Promise.all(pending.map(p => p.result));
    }
    await vi.waitFor(() => expect(held.get("alice")?.size).toBe(0));
    expect((await discover(second.tokens.access_token)).status).toBe(200);
  });

  it("revokes only the selected grant's active requests and preserves other users", async () => {
    const alice = await linked(), otherAlice = await linked(), bob = await linked("bob");
    const aliceRequest = holdCamera(alice.tokens.access_token), otherAliceRequest = holdCamera(otherAlice.tokens.access_token), bobRequest = holdCamera(bob.tokens.access_token);
    try {
      await vi.waitFor(() => { expect(held.get("alice")?.size).toBe(2); expect(held.get("bob")?.size).toBe(1); });
      expect((await form("/revoke", { client_id: "approved-ai", token: alice.tokens.access_token })).status).toBe(200);
      await vi.waitFor(() => expect(held.get("alice")?.size).toBe(1));
      expect(await aliceRequest.result).not.toBe(200);
      expect(held.get("bob")?.size).toBe(1);
      expect((await discover(alice.tokens.access_token)).status).toBe(401);
      expect((await discover(otherAlice.tokens.access_token)).status).toBe(200);
      expect((await discover(bob.tokens.access_token)).status).toBe(200);
    } finally {
      aliceRequest.controller.abort(); otherAliceRequest.controller.abort(); bobRequest.controller.abort();
      await Promise.all([aliceRequest.result, otherAliceRequest.result, bobRequest.result]);
    }
  });

  it("keeps revocation available at the global request limit and recovers capacity", async () => {
    const grants = await Promise.all(["alice", "bob", "charlie", "dana", "erin"].map(name => linked(name)));
    const pending = grants.slice(0, 4).flatMap(grant => Array.from({ length: 4 }, () => holdCamera(grant.tokens.access_token)));
    try {
      await vi.waitFor(() => expect([...held.values()].reduce((n, requests) => n + requests.size, 0)).toBe(16));
      const before = logins.length;
      expect((await discover(grants[4].tokens.access_token)).status).toBe(503);
      expect(logins).toHaveLength(before);
      expect((await form("/revoke", { client_id: "approved-ai", token: grants[0].tokens.access_token }, { origin: "https://evil.example" })).status).toBe(403);
      expect((await form("/revoke", { client_id: "approved-ai", token: grants[0].tokens.access_token })).status).toBe(200);
      await vi.waitFor(() => expect(held.get("alice")?.size).toBe(0));
      for (const name of ["bob", "charlie", "dana"]) expect(held.get(name)?.size).toBe(4);
      expect((await discover(grants[0].tokens.access_token)).status).toBe(401);
      expect((await discover(grants[4].tokens.access_token)).status).toBe(200);
    } finally {
      pending.forEach(p => p.controller.abort()); await Promise.all(pending.map(p => p.result));
    }
    await vi.waitFor(() => expect([...held.values()].reduce((n, requests) => n + requests.size, 0)).toBe(0));
    expect((await discover(grants[4].tokens.access_token)).status).toBe(200);
  });

  it("bounds the reserved revocation capacity independently and releases abandoned requests", async () => {
    const grant = await linked();
    const pending = Array.from({ length: 2 }, () => {
      const req = request(base + "/revoke", { method: "POST", headers: {
        "content-type": "application/x-www-form-urlencoded", "content-length": 100,
      } }, res => res.resume());
      req.on("error", () => {}); req.write("c"); return req;
    });
    try {
      await vi.waitFor(async () => expect((await form("/revoke", { client_id: "approved-ai", token: "invalid" })).status).toBe(503));
      expect((await discover(grant.tokens.access_token)).status).toBe(200);
    } finally { pending.forEach(req => req.destroy()); }
    await vi.waitFor(async () => expect((await form("/revoke", { client_id: "approved-ai", token: grant.tokens.access_token })).status).toBe(200));
    expect((await discover(grant.tokens.access_token)).status).toBe(401);
  });

  it("preserves account ownership and recovers all slots over repeated full-capacity bursts", async () => {
    const names = ["alice", "bob", "charlie", "dana"];
    const grants = await Promise.all(names.map(name => linked(name)));
    const before = logins.length;
    for (let round = 0; round < 4; round++) {
      await Promise.all(grants.flatMap((grant, index) => Array.from({ length: 4 }, async () => {
        const response = await fetch(base + "/mcp", { method: "POST", headers: {
          authorization: `Bearer ${grant.tokens.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream",
        }, body: JSON.stringify({ jsonrpc: "2.0", id: round, method: "tools/call", params: {
          name: "ivedaai_camera", arguments: { operation: "GET /api/cameras/{cameraId}", path: { cameraId: 1 } },
        } }) });
        expect(response.status).toBe(200);
        const result = (await response.json()).result;
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent.body).toMatchObject({ cameraId: 1, owner: names[index] });
      })));
    }
    expect(logins).toHaveLength(before + 64);
    for (const name of names) expect(logins.filter(owner => owner === name)).toHaveLength(17);
  });
});

describe("existing IvedaAI login", () => {
  const cameraWrite = "POST /api/cameras/{cameraId}/jobs";
  async function enableWrites() {
    await service.close();
    service = createIvedaLoginServer({ ...config, upstreamOrigin: `http://127.0.0.1:${(upstream.address() as { port: number }).port}`, allowedWriteOperations: [cameraWrite] });
    base = await listen(service.http);
  }
  async function operate(bearer: string, operation = cameraWrite) {
    const client = new Client({ name: "write-test", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
      return await client.callTool({ name: "ivedaai_camera", arguments: { operation, path: { cameraId: 1 }, ...(operation === cameraWrite ? { query: { activate: true } } : {}) } });
    } finally { await client.close(); }
  }
  it("rejects write authorization unless the installation enables specific actions", async () => {
    const flow = await start({ scope: "ivedaai:read ivedaai:write" });
    expect(flow.response.status).not.toBe(200); expect(flow.flow).toBe(""); expect(logins).toHaveLength(0);
  });
  it("requires separate consent to changes and preserves the read-only login option", async () => {
    await enableWrites();
    const flow = await start({ scope: "ivedaai:read ivedaai:write" });
    expect(flow.html).toContain('name="writeConsent"');
    expect(flow.html).not.toContain("It cannot make changes");
    expect((await login(flow)).status).toBe(400); expect(logins).toHaveLength(0);
    const reader = await linked();
    expect((await operate(reader.tokens.access_token)).isError).toBe(true); expect(writes).toHaveLength(0);
  });
  it("allows consented camera control but withholds unlisted writes and compound helpers", async () => {
    await enableWrites(); const writer = await linked("alice", true);
    const list = await (await discover(writer.tokens.access_token)).json();
    const camera = list.result.tools.find((tool: { name: string }) => tool.name === "ivedaai_camera");
    expect(camera.securitySchemes[0].scopes).toEqual(["ivedaai:read", "ivedaai:write"]);
    expect(camera.annotations.readOnlyHint).toBe(false);
    expect(camera.annotations.destructiveHint).toBe(true);
    expect(list.result.tools.some((tool: { name: string }) => ["ivedaai_add_camera", "ivedaai_alert_integration"].includes(tool.name))).toBe(false);
    expect((await operate(writer.tokens.access_token)).isError).not.toBe(true);
    expect(writes).toEqual([{ method: "POST", url: "/ainvr/api/cameras/1/jobs?activate=true", owner: "alice" }]);
    expect((await operate(writer.tokens.access_token, "DELETE /api/cameras/{cameraId}")).isError).toBe(true);
    expect(writes).toHaveLength(1);
  });
  it("preserves upstream account denials even when the user consents to write access", async () => {
    await enableWrites(); const writer = await linked("bob", true);
    const response = await operate(writer.tokens.access_token);
    expect(response.isError).toBe(true); expect(response.structuredContent).toMatchObject({ status: 403 });
    expect(writes).toHaveLength(0);
  });
  it("cannot escalate read grants through refresh and keeps narrowed refresh tokens read-only", async () => {
    await enableWrites(); const reader = await linked();
    const fields = { client_id: "approved-ai", grant_type: "refresh_token", resource: config.publicUrl };
    expect((await form("/token", { ...fields, refresh_token: reader.tokens.refresh_token, scope: "ivedaai:read ivedaai:write" })).status).toBe(400);
    const writer = await linked("alice", true);
    const narrowResponse = await form("/token", { ...fields, refresh_token: writer.tokens.refresh_token, scope: "ivedaai:read" });
    expect(narrowResponse.status).toBe(200); const narrowed = await narrowResponse.json();
    expect(narrowed.scope).toBe("ivedaai:read");
    expect((await operate(narrowed.access_token)).isError).toBe(true);
    expect((await form("/token", { ...fields, refresh_token: narrowed.refresh_token, scope: "ivedaai:read ivedaai:write" })).status).toBe(400);
    expect(writes).toHaveLength(0);
  });
  it("requires HTTPS installation and callback configuration without stored user passwords", () => {
    expect(ivedaLoginConfigSchema.safeParse(config).success).toBe(true);
    expect(ivedaLoginConfigSchema.safeParse({ ...config, subjects: [] }).success).toBe(false);
    expect(ivedaLoginConfigSchema.safeParse({ ...config, upstreamOrigin: "http://example.com" }).success).toBe(false);
    expect(ivedaLoginConfigSchema.safeParse({ ...config, clients: [{ ...config.clients[0], redirectUris: ["https://ai.example/callback#fragment"] }] }).success).toBe(false);
  });
  it("publishes PKCE, resource and revocation metadata and hardens the login form", async () => {
    const metadata = await (await fetch(base + "/.well-known/oauth-authorization-server")).json();
    expect(metadata).toMatchObject({ code_challenge_methods_supported: ["S256"], scopes_supported: ["ivedaai:read"], revocation_endpoint: "https://mcp.customer.example/revoke" });
    expect(metadata.registration_endpoint).toBeUndefined();
    const flow = await start();
    expect(flow.response.headers.get("set-cookie")).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(flow.response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(flow.response.headers.get("content-security-policy")).toContain("form-action 'self' https://ai.example;");
    expect(flow.response.headers.get("referrer-policy")).toBe("strict-origin");
    expect(flow.response.headers.get("cache-control")).toBe("no-store");
    expect(flow.html).toContain('autocomplete="current-password"');
    expect(logins).toHaveLength(0);
  });
  it("rejects unknown clients and unregistered redirects before IvedaAI login", async () => {
    expect((await start({ client_id: "unregistered" })).response.status).toBe(400);
    expect((await start({ redirect_uri: "https://attacker.example/receive" })).response.status).toBe(400);
    expect(logins).toHaveLength(0);
  });
  it.each(["cookie", "csrf", "origin", "null-origin", "consent"])("requires %s before validating credentials", async field => {
    const flow = await start();
    const response = await login(flow, field === "csrf" ? { csrf: "forged" } : field === "consent" ? { consent: "no" } : {},
      field === "cookie" ? { cookie: "" } : field === "origin" ? { origin: "https://attacker.example" } : field === "null-origin" ? { origin: "null" } : {});
    expect(response.status).toBeGreaterThanOrEqual(400); expect(logins).toHaveLength(0);
  });
  it("rejects an invalid password without returning upstream diagnostics or codes", async () => {
    const response = await login(await start(), { password: "wrong" });
    expect(response.status).toBe(400); expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).not.toContain("private upstream diagnostic");
  });
  it("binds code to PKCE, resource, client and exact callback and consumes it once", async () => {
    const flow = await start(), response = await login(flow);
    const redirect = new URL(response.headers.get("location")!); const code = redirect.searchParams.get("code")!;
    expect(redirect.origin + redirect.pathname).toBe(config.clients[0].redirectUris[0]);
    expect(redirect.searchParams.get("state")).toBe("client-state");
    for (const extra of [{ code_verifier: "wrong" }, { resource: "https://other.example/mcp" }, { client_id: "other-ai" }, { redirect_uri: "https://ai.example/different" }] as Record<string, string>[]) {
      expect((await exchange(flow, code, extra)).status).toBe(400);
    }
    expect((await exchange(flow, code)).status).toBe(200);
    expect((await exchange(flow, code)).status).toBe(400);
    expect((await login(flow)).status).toBe(400);
  });
  it("connects a real SDK client using the logged-in account and a separate opaque token", async () => {
    const { tokens } = await linked("bob");
    expect(tokens.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(tokens)).not.toContain("fixture-password");
    const client = new Client({ name: "login-test", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }));
      const result = await client.callTool({ name: "ivedaai_camera", arguments: { operation: "GET /api/cameras/{cameraId}", path: { cameraId: 1 } } });
      expect(result.structuredContent).toMatchObject({ body: { owner: "bob" } });
      expect(logins.every(username => username === "bob")).toBe(true);
    } finally { await client.close(); }
  });
  it("rotates refresh tokens and revokes the grant on old-token reuse", async () => {
    const { tokens } = await linked();
    const fields = { client_id: "approved-ai", grant_type: "refresh_token", refresh_token: tokens.refresh_token, resource: config.publicUrl };
    const response = await form("/token", fields); expect(response.status).toBe(200);
    const next = await response.json(); expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect((await discover(next.access_token)).status).toBe(200);
    expect((await form("/token", fields)).status).toBe(400);
    expect((await discover(next.access_token)).status).toBe(401);
  });
  it("revoking one user's grant aborts its identity signal without affecting another user", async () => {
    const alice = await linked("alice"), bob = await linked("bob");
    const identity = await service.provider.authenticate(`Bearer ${alice.tokens.access_token}`);
    expect(identity.signal?.aborted).toBe(false);
    await form("/revoke", { client_id: "approved-ai", token: alice.tokens.access_token });
    expect(identity.signal?.aborted).toBe(true);
    expect((await discover(alice.tokens.access_token)).status).toBe(401);
    expect((await discover(bob.tokens.access_token)).status).toBe(200);
  });
  it("revokes access immediately and rejects refresh after the upstream login stops working", async () => {
    const first = await linked();
    expect((await form("/revoke", { client_id: "other-ai", token: first.tokens.access_token })).status).toBe(200);
    expect((await discover(first.tokens.access_token)).status).toBe(200);
    expect((await form("/revoke", { client_id: "approved-ai", token: first.tokens.access_token })).status).toBe(200);
    expect((await discover(first.tokens.access_token)).status).toBe(401);
    const second = await linked(); disabled = true;
    expect((await form("/token", { client_id: "approved-ai", grant_type: "refresh_token", refresh_token: second.tokens.refresh_token, resource: config.publicUrl })).status).toBe(400);
    expect((await discover(second.tokens.access_token)).status).toBe(401);
  });
  it("expires unused codes and issued access tokens", async () => {
    const grant = await linked();
    const flow = await start(), response = await login(flow);
    const code = new URL(response.headers.get("location")!).searchParams.get("code")!;
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now + 301000);
    expect((await exchange(flow, code)).status).toBe(400);
    expect((await discover(grant.tokens.access_token)).status).toBe(401);
  });
  it("rejects an expired form before upstream login and accepts a fresh connection", async () => {
    const expired = await start();
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now + 301000);
    const rejected = await login(expired);
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).toContain("restart this connection from your AI app");
    expect(logins).toHaveLength(0);
    const fresh = await linked();
    expect((await discover(fresh.tokens.access_token)).status).toBe(200);
  });
  it("recovers an expired access token by refresh without extending the grant lifetime", async () => {
    const grant = await linked();
    const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now + 301000);
    expect((await discover(grant.tokens.access_token)).status).toBe(401);
    const refreshed = await form("/token", { client_id: "approved-ai", grant_type: "refresh_token", refresh_token: grant.tokens.refresh_token, resource: config.publicUrl });
    expect(refreshed.status).toBe(200);
    const next = await refreshed.json();
    expect((await discover(next.access_token)).status).toBe(200);
    clock.mockReturnValue(now + 3601000);
    expect((await discover(next.access_token)).status).toBe(401);
    expect((await form("/token", { client_id: "approved-ai", grant_type: "refresh_token", refresh_token: next.refresh_token, resource: config.publicUrl })).status).toBe(400);
    const fresh = await linked();
    expect((await discover(fresh.tokens.access_token)).status).toBe(200);
  });
  it("limits repeated password attempts", async () => {
    for (let i = 0; i < 5; i++) expect((await login(await start(), { password: "wrong" })).status).toBe(400);
    expect((await login(await start(), { password: "wrong" })).status).toBe(429);
    expect(logins).toHaveLength(5);
  });
});

describe("server selection", () => {
  it("rejects unconfigured destinations before sending credentials", async () => {
    const flow = await start();
    expect(flow.html).toContain('name="serverOrigin"');
    const response = await login(flow, { serverOrigin: "https://unapproved.example" });
    expect(response.status).toBe(400);
    expect(logins).toEqual([]);
  });
  it("binds credentials, refresh and API calls to the selected instance", async () => {
    const requests: string[] = [];
    const second = createServer(async (req, res) => {
      requests.push(req.url!);
      res.setHeader("content-type", "application/json");
      if (req.url?.endsWith("/oauth2/token")) {
        let body = ""; for await (const chunk of req) body += chunk;
        expect(new URLSearchParams(body).get("username")).toBe("alice");
        res.end(JSON.stringify({ access_token: "second-alice", expires_in: 3600, token_type: "Bearer" }));
      } else {
        expect(req.headers.authorization).toBe("Bearer second-alice");
        res.end(JSON.stringify({ cameraId: 1, name: "Second instance" }));
      }
    });
    const secondOrigin = await listen(second);
    try {
      await service.close();
      service = createIvedaLoginServer({ ...config, upstreamOrigin: `http://127.0.0.1:${(upstream.address() as {port:number}).port}`,
        upstreamServers: [{ name: "Warehouse", upstreamOrigin: secondOrigin }] });
      base = await listen(service.http);
      const first = await linked();
      const flow = await start();
      expect(flow.html).toContain("Warehouse");
      const response = await login(flow, { serverOrigin: secondOrigin });
      expect(response.status).toBe(303);
      const code = new URL(response.headers.get("location")!).searchParams.get("code")!;
      const tokens = await (await exchange(flow, code)).json();
      const a = await service.provider.authenticate(`Bearer ${first.tokens.access_token}`);
      const b = await service.provider.authenticate(`Bearer ${tokens.access_token}`);
      expect(a.subject).not.toBe(b.subject);
      expect(b.upstream?.upstreamOrigin).toBe(secondOrigin);
      const result = await fetch(base + "/mcp", { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ivedaai_camera", arguments: { operation: "GET /api/cameras/{cameraId}", path: { cameraId: 1 } } } }) });
      expect(await result.text()).toContain("Second instance");
      const before = requests.length;
      const refreshed = await form("/token", { client_id: "approved-ai", grant_type: "refresh_token", refresh_token: tokens.refresh_token, resource: config.publicUrl });
      expect(refreshed.status).toBe(200);
      expect(requests.length).toBeGreaterThan(before);
      expect(logins).toEqual(["alice"]);
    } finally { await new Promise<void>(resolve => { second.close(() => resolve()); second.closeAllConnections(); }); }
  });
});
