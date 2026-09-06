import { describe, it, expect, vi } from "vitest";
import { ChatGPTClientResolver } from "../src/chatgptClient.js";
const id = "https://chatgpt.com/oauth/test-client/client.json";
const doc = { client_id: id, redirect_uris: ["https://chatgpt.com/connector/oauth/test-client"], token_endpoint_auth_method: "private_key_jwt", token_endpoint_auth_methods_supported: ["none", "private_key_jwt"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
describe("ChatGPT client metadata", () => {
  it("resolves callback metadata, selects supported public-client auth and caches concurrent requests", async () => {
    const request = vi.fn(async () => response(doc));
    const resolver = new ChatGPTClientResolver(request);
    const [a, b] = await Promise.all([resolver.getClient(id), resolver.getClient(id)]);
    expect(a?.token_endpoint_auth_method).toBe("none");
    expect(a?.redirect_uris).toEqual(doc.redirect_uris);
    expect(b).toEqual(a);
    await resolver.getClient(id);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]).toBeDefined();
  });
  it.each(["http://chatgpt.com/oauth/client.json", "https://chatgpt.com.evil.test/oauth/client.json", "https://127.0.0.1/oauth/client.json", id + "?url=http://localhost", "https://chatgpt.com:443/oauth/client.json", "https://chatgpt.com/oauth/../client.json"])("never fetches untrusted identifier %s", async value => {
    const request = vi.fn(async () => response(doc));
    expect(await new ChatGPTClientResolver(request).getClient(value)).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    { client_id: id + "x" },
    { redirect_uris: ["https://evil.test/callback"] },
    { redirect_uris: ["https://chatgpt.com/connector/oauth/*"] },
    { redirect_uris: [] },
    { token_endpoint_auth_methods_supported: ["private_key_jwt"] },
    { grant_types: ["client_credentials"] },
    { response_types: ["token"] },
  ])("rejects invalid metadata %j", async override => {
    expect(await new ChatGPTClientResolver(async () => response({ ...doc, ...override })).getClient(id)).toBeUndefined();
  });
  it("bounds document size and rejects redirected requests", async () => {
    expect(await new ChatGPTClientResolver(async () => response({ ...doc, extra: "x".repeat(33000) })).getClient(id)).toBeUndefined();
    const request = vi.fn<typeof fetch>(async (_url, options) => { expect(options?.redirect).toBe("error"); throw new Error("redirect"); });
    expect(await new ChatGPTClientResolver(request).getClient(id)).toBeUndefined();
  });
});
