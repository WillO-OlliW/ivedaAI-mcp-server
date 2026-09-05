import { z } from "zod";
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from "jose";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { Agent } from "undici";

export const httpsUrl = z.string().url().refine(value => {
  const u = new URL(value);
  return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
}, "Expected HTTPS URL without credentials, query or fragment");

export const writeOperationsSchema = z.array(z.string().min(1).max(300)).max(64)
  .refine(values => new Set(values).size === values.length, "Duplicate write operation").optional();
export const upstreamTlsSchema = z.object({
  caFile: z.string().refine(isAbsolute, "CA file must be an absolute path"),
  serverName: z.string().min(1).max(253).regex(/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/).optional(),
}).strict().optional();

/** Scoped trust for a customer private CA; normal chain, expiry and hostname checks still apply. */
export function remoteDispatcher(config: { upstreamTls?: z.infer<typeof upstreamTlsSchema> }) {
  if (!config.upstreamTls) return () => undefined;
  if (statSync(config.upstreamTls.caFile).size > 65536) throw new Error("CA file too large");
  const ca = readFileSync(config.upstreamTls.caFile, "utf8");
  if (!ca.includes("-----BEGIN CERTIFICATE-----") || ca.includes("PRIVATE KEY")) throw new Error("Expected public CA certificates");
  const servername = config.upstreamTls.serverName;
  return () => new Agent({ connect: { ca, ...(servername ? { servername } : {}) } });
}

export const remoteConfigSchema = z.object({
  publicUrl: httpsUrl.refine(value => new URL(value).pathname === "/mcp", "Endpoint path must be /mcp"),
  issuer: httpsUrl,
  jwksUrl: httpsUrl,
  upstreamOrigin: httpsUrl.refine(value => new URL(value).pathname === "/", "Upstream must be an origin"),
  port: z.number().int().min(1024).max(65535).default(3000),
  allowedWriteOperations: writeOperationsSchema,
  upstreamTls: upstreamTlsSchema,
  subjects: z.array(z.object({
    subject: z.string().min(1).max(512),
    username: z.string().min(1).max(512),
    password: z.string().min(1).max(4096),
  }).strict()).min(1).max(1000),
}).strict().superRefine((config, context) => {
  if (new Set(config.subjects.map(s => s.subject)).size !== config.subjects.length) {
    context.addIssue({ code: "custom", message: "Duplicate OAuth subject" });
  }
});
export type RemoteConfig = z.infer<typeof remoteConfigSchema>;
export type RemoteSubject = RemoteConfig["subjects"][number] & { signal?: AbortSignal; scopes?: readonly string[] };
export const READ_SCOPE = "ivedaai:read";
export const WRITE_SCOPE = "ivedaai:write";
export function remoteScopes(config: { allowedWriteOperations?: readonly string[] }): string[] {
  return config.allowedWriteOperations?.length ? [READ_SCOPE, WRITE_SCOPE] : [READ_SCOPE];
}

// Fixed operator-configured JWKS origin. Never follow token-provided key URLs or redirects.
// Bound the response as well as its duration; jose handles key rotation/cache/concurrent fetches.
export function remoteKeys(url: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(url), {
    timeoutDuration: 3000,
    [customFetch]: async (input, init) => {
      const response = await fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(3000) });
      if (response.status !== 200 || !response.body) {
        await response.body?.cancel();
        throw new Error("JWKS unavailable");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          if (length > 65536) throw new Error("JWKS response too large");
          chunks.push(part.value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      return new Response(Buffer.concat(chunks), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
}

export class AuthenticationError extends Error {
  constructor(readonly status: 401 | 403) { super(status === 401 ? "Unauthorized" : "Forbidden"); }
}

export function createAuthenticator(config: RemoteConfig, keys = remoteKeys(config.jwksUrl)) {
  const subjects = new Map(config.subjects.map(s => [s.subject, { ...s }]));
  return async (authorization: string | undefined): Promise<RemoteSubject> => {
    if (!authorization || authorization.length > 16384 || !/^Bearer [^\s]+$/i.test(authorization)) {
      throw new AuthenticationError(401);
    }
    let payload;
    try {
      ({ payload } = await jwtVerify(authorization.slice(7), keys, {
        issuer: config.issuer, audience: config.publicUrl, algorithms: ["RS256", "ES256"],
        requiredClaims: ["iss", "aud", "sub", "iat", "exp"], maxTokenAge: 3600,
      }));
      // Require a token minted specifically for this installation, not a multi-resource token.
      if (payload.aud !== config.publicUrl || !payload.sub ||
          payload.exp! - payload.iat! > 3600) throw new Error("Invalid access token");
    } catch { throw new AuthenticationError(401); }
    const subject = subjects.get(payload.sub);
    if (!subject || typeof payload.scope !== "string" || !payload.scope.split(" ").includes(READ_SCOPE)) {
      throw new AuthenticationError(403);
    }
    return { ...subject, scopes: payload.scope.split(" ").filter((scope: string) => remoteScopes(config).includes(scope)) };
  };
}
