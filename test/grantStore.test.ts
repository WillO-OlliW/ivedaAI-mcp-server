import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { GrantStore } from '../src/grantStore.js';
import { IvedaLoginProvider, type IvedaLoginConfig } from '../src/ivedaLogin.js';
let dir: string;
let provider: IvedaLoginProvider | undefined;
let config: IvedaLoginConfig;
const validate = vi.fn<ConstructorParameters<typeof IvedaLoginProvider>[1]>(async () => {});
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'iveda-grants-'));
  writeFileSync(join(dir, 'key'), randomBytes(32), { mode: 0o600 });
  config = { auth: 'ivedaai', publicUrl: 'https://mcp.example/mcp', upstreamOrigin: 'https://iveda.example/', port: 3000,
    clients: [{ clientId: 'test', name: 'Test', redirectUris: ['https://ai.example/callback'] }],
    persistentGrants: { file: join(dir, 'grants'), keyFile: join(dir, 'key'), lifetimeHours: 168 } };
  validate.mockReset(); validate.mockResolvedValue();
});
afterEach(() => { provider?.close(); provider = undefined; vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });
function open() { provider = new IvedaLoginProvider(config, validate); return provider; }
async function client() { return (await provider!.clientsStore.getClient('test'))!; }
async function grant(server = config.upstreamOrigin) {
  const p = provider!;
  const response = { setHeader() {}, type() { return this; }, send() {} } as unknown as Response;
  await p.authorize(await client(), { redirectUri: 'https://ai.example/callback', codeChallenge: 'a'.repeat(43), scopes: ['ivedaai:read'], resource: new URL(config.publicUrl) }, response);
  const [id, flow] = [...p.flows][0];
  const redirect = await p.completeLogin(id, flow.csrf, `__Host-iveda-login=${id}`, 'fixture-user', 'fixture-password', 'yes', undefined, undefined, server);
  return p.exchangeAuthorizationCode(await client(), new URL(redirect).searchParams.get('code')!, undefined, 'https://ai.example/callback', new URL(config.publicUrl));
}
async function refresh(token: string) { return provider!.exchangeRefreshToken(await client(), token, undefined, new URL(config.publicUrl)); }
it('encrypts credentials and tokens, restores access and refresh after restart, and keeps server binding', async () => {
  config.upstreamServers = [{ name: 'Second', upstreamOrigin: 'https://second.example/' }];
  open(); const tokens = await grant('https://second.example/'); provider!.close(); open();
  const bytes = readFileSync(config.persistentGrants!.file).toString();
  for (const secret of ['fixture-password', 'fixture-user', tokens.access_token, tokens.refresh_token!]) expect(bytes).not.toContain(secret);
  expect((await provider!.authenticate(`Bearer ${tokens.access_token}`)).upstream?.upstreamOrigin).toBe('https://second.example/');
  const rotated = await refresh(tokens.refresh_token!); expect(rotated.expires_in).toBeGreaterThanOrEqual(299);
  expect(validate.mock.calls.at(-1)?.[3]).toEqual({ upstreamOrigin: 'https://second.example/' });
});
it('allows refresh after one hour but expires at the original seven-day deadline', async () => {
  const now = Date.now(); open(); const tokens = await grant();
  vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 3600000);
  await expect(provider!.verifyAccessToken(tokens.access_token)).rejects.toThrow();
  const rotated = await refresh(tokens.refresh_token!); provider!.close(); open();
  vi.spyOn(Date, 'now').mockReturnValue(now + 169 * 3600000);
  await expect(refresh(rotated.refresh_token!)).rejects.toThrow();
});
it('persists revocation across restart', async () => {
  open(); const tokens = await grant();
  await provider!.revokeToken(await client(), { token: tokens.refresh_token! }); provider!.close(); open();
  await expect(refresh(tokens.refresh_token!)).rejects.toThrow();
  await expect(provider!.verifyAccessToken(tokens.access_token)).rejects.toThrow();
});
it('detects refresh replay after restart and revokes the entire grant', async () => {
  open(); const tokens = await grant(); const rotated = await refresh(tokens.refresh_token!);
  provider!.close(); open(); await expect(refresh(tokens.refresh_token!)).rejects.toThrow();
  provider!.close(); open(); await expect(refresh(rotated.refresh_token!)).rejects.toThrow();
});
it('invalidates saved grants when administrator policy changes', async () => {
  open(); const tokens = await grant(); provider!.close(); config.upstreamOrigin = 'https://changed.example/'; open();
  await expect(refresh(tokens.refresh_token!)).rejects.toThrow();
});
it('fails closed for a disabled upstream account during renewal', async () => {
  open(); const tokens = await grant(); validate.mockRejectedValueOnce(new Error('disabled'));
  await expect(refresh(tokens.refresh_token!)).rejects.toThrow(); provider!.close(); open();
  await expect(provider!.verifyAccessToken(tokens.access_token)).rejects.toThrow();
});
it('rejects corrupt ciphertext and simultaneous writers', () => {
  const settings = config.persistentGrants!;
  const store = new GrantStore(settings.file, settings.keyFile, config.publicUrl);
  expect(() => new GrantStore(settings.file, settings.keyFile, config.publicUrl)).toThrow();
  store.save({ secret: 'fixture-password' }); store.close();
  const bytes = readFileSync(settings.file); bytes[bytes.length - 1] ^= 1; writeFileSync(settings.file, bytes);
  expect(() => open()).toThrow('Cannot load encrypted grants');
});
it('rejects a wrong key and an incomplete transaction', () => {
  const settings = config.persistentGrants!;
  const store = new GrantStore(settings.file, settings.keyFile, config.publicUrl); store.save({}); store.close();
  writeFileSync(settings.keyFile, randomBytes(32)); expect(() => open()).toThrow();
  writeFileSync(settings.file + '.pending', ''); expect(() => open()).toThrow('Incomplete grant write');
});

