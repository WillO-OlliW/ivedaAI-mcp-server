# Authenticated HTTP preview

## Camera snapshot viewer

Remote clients also receive `ivedaai_camera_snapshot`, a read-only tool that takes a positive
`cameraId`, fetches one current JPG frame and returns an MCP Apps viewer. Use this tool when a
user asks to see a camera. Resolve names through `ivedaai_camera` first. Refresh the client's tool
definitions or reconnect after upgrading so it discovers this tool and its UI resource.
Start a new conversation after refreshing: an existing ChatGPT conversation may retain the old
operation schemas even when plugin settings display the updated tools.

The image remains an MCP image block for compatible clients and is supplied to the viewer through
private result metadata. It is not published at a public URL or stored by the connector. The viewer
makes no external network requests. Normal OAuth and upstream account permissions apply, and the
tool never activates a camera. HTTP 204 means no frame was returned, even if the camera reports
Processing; the viewer reports that instead of claiming an image exists. Oversized, incomplete and
unsupported image responses are not displayed. Retrieval time is not a camera capture timestamp.

The viewer uses the [MCP Apps UI pattern](https://developers.openai.com/plugins/build/chatgpt-ui).
Clients without UI support still receive the standard MCP result. Native image-block support does
not guarantee that a client will display an image inline. Automated HTTP and browser fixture tests
cover delivery. An actual camera image rendered in the authorized ChatGPT Work pilot on
2026-09-05, including a fresh result with the client's CSP enforcement enabled. Other clients
and the eventual production deployment still require their own acceptance checks.

## Transport and authentication

The repository includes a Streamable HTTP entry point, `dist/http.js`, with optional controlled writes alongside
the unchanged stdio command. It is tested against local mock services and signed test tokens.
Existing IvedaAI login, token exchange, a camera read, refresh and revocation also passed through
a temporary loopback connector against the authorized test deployment. The temporary HTTPS
ChatGPT pilot also passed login, camera reads and snapshot display; the user reported successful
camera start/stop with the final state restored. Lightsail Ubuntu 24.04 hosting and verified HTTPS have passed deployment checks. Private-network relay
support for other AI vendors is not implemented.

## One company, explicit user accounts

Run one connector per company. Configure a default IvedaAI origin and optional named servers
using [SERVER-SELECTION.md](SERVER-SELECTION.md). Users select or enter a configured address
on the HTTPS login page and use their own credentials. The field starts empty. Each grant binds
its selected origin, certificate trust, account and scopes; refresh and API calls retain that
binding. Unconfigured addresses are rejected before forwarding credentials. IvedaAI permissions
remain authoritative. The MCP token is never forwarded upstream and ChatGPT never receives the
IvedaAI password.

Each HTTP request gets a fresh MCP server and upstream token manager. There are no shared MCP
sessions or persistent upstream token caches across requests. This trades additional upstream
logins for simple isolation in the preview; measure authentication load before production use.

Remote access defaults to read-only. Collection deletion and local-file uploads remain disabled,
and secret redaction is enabled. Selected writes require configuration and a verified write scope;
stdio's environment switches cannot grant remote writes or uploads.
The bundled read-only surface is 55 grouped tools / 132 operations plus the dedicated snapshot
tool (56 tools total); review its full read
surface against the intended users' application grants.

## Use existing IvedaAI login

No separate identity provider or duplicate user account is required. The connector supplies the
OAuth compatibility layer using the MCP SDK's authorization-code/PKCE routes. ChatGPT automatically uses CIMD: the connector fetches bounded metadata only from supported
HTTPS URLs on chatgpt.com and validates exact published callbacks. No manual callback or client
ID is needed. Existing pre-registered public clients remain supported. DCR is not implemented.
Read and optional write scopes still require user consent.
See [OpenAI OAuth requirements](https://developers.openai.com/plugins/build/auth).

Create a protected installation configuration outside the repository:

```json
{
  "auth": "ivedaai",
  "publicUrl": "https://mcp.customer.example/mcp",
  "upstreamOrigin": "https://ivedaai.customer.example",
  "port": 3000,
  "clients": []
}
```

This configuration contains no IvedaAI passwords. Login passwords are retained in the connector's
process memory for at most one hour to make upstream calls and revalidate refreshes. They are not
written to a credential database or configuration file. Run under a protected service identity;
process dumps or access to its memory can expose credentials. Dropping references is not a claim
of secure memory erasure.

Login attempts are protected by an expiring, single-use form transaction, secure HttpOnly cookie,
same-origin check, CSRF token, explicit consent and attempt limits. Authorization codes last one
minute and require the matching PKCE verifier, client, callback and resource. Access tokens last
up to five minutes. Refresh tokens rotate; reusing an old refresh token revokes that grant.
`/revoke` invalidates the entire grant and aborts its active MCP requests. The maximum grant
lifetime is one hour, after which the user signs in again. Restart invalidates all grants.

The preview keeps bounded grants and token hashes in memory. It does not provide durable login
state, high-availability replication or dynamic client registration. It cannot perform an IvedaAI
MFA challenge or federated SSO flow; accounts requiring unsupported authentication remain blocked.
Do not disable their protections to make the connector work. Application account setup and required
first-login password changes must be completed in IvedaAI. Upstream password/account changes are
checked on refresh and on subsequent upstream logins; discovery may remain available until local
revocation or expiry. Each customer's operator must establish its production access-revocation policy.

## Enable selected actions

See [CUSTOMER-WRITE-POLICY.md](CUSTOMER-WRITE-POLICY.md) for proposed camera-control and
maintenance profiles, their actual permission scope, and the complete write-operation inventory.

To enable camera start/stop control, add this property to the installation configuration:

```json
"allowedWriteOperations": ["POST /api/cameras/{cameraId}/jobs"]
```

Then reconnect the AI client requesting both `ivedaai:read` and `ivedaai:write`. The native login
page requires a separate consent checkbox for making changes. A read-only grant stays read-only
even on an installation with actions enabled. Refresh cannot increase a grant's permissions;
requesting only the read scope on refresh narrows the new access/refresh token pair.

Only exact configured write operations are advertised and callable. Unknown operations, read
operations in the write list and collection deletes are rejected at startup. Other actions can
be enabled by their exact documented operation IDs after their workflow has been validated.
Application permissions remain authoritative: enabling an operation never bypasses IvedaAI's
account or record permissions. The allowlist selects operation types, not specific camera IDs.

Compound camera-onboarding and alert-integration helper tools are withheld from the remote surface
because they perform multiple operations. Use the individually enabled resource operations. Local
file uploads remain disabled. Write-capable tools advertise both OAuth scopes, readOnlyHint=false
and a conservative destructiveHint=true so clients can present their normal action confirmations.
Client annotations are advisory; server-side scope and operation checks enforce access.

For external JWT mode, the issuer must grant the write scope only after its own authorization and
consent checks. A signed write scope alone cannot enable operations absent from the installation
allowlist. Restart to apply configuration changes; native grants end on restart.

Controlled live HTTP checks also passed camera name/description edits and disabled alert-rule
name/cooldown edits, read-back, restoration, and read-only grant denials. These used disposable
records that were removed afterward. See [HOSTING.md](HOSTING.md) for the corresponding optional
operation list and deployment templates. This evidence does not establish every write workflow
or every IvedaAI account role.

An actual ChatGPT Work test subsequently renamed/restored a disposable camera and edited/restored
a disabled rule's name/cooldown, verifying its association, condition, schedule and triggers.
The browser also recovered from a pilot restart through its Reconnect action and existing IvedaAI
sign-in. Full-grant expiry and expired-form recovery are covered by automated login tests.

## Optional external identity provider

The alternative JWT mode can use an existing OAuth/OIDC authorization server. In that mode the
package acts only as the MCP resource server and does not issue tokens. Configure
the identity provider's authorization-code flow with PKCE and discovery for the selected client.
See [OpenAI authentication requirements](https://developers.openai.com/plugins/build/auth).

This implementation accepts signed JWT access tokens with:

- RS256 or ES256 signatures from the operator-configured HTTPS JWKS URL.
- An exact configured `iss` and a single `aud` equal to the public MCP URL, including `/mcp`.
- A configured nonempty `sub`, `iat`, `exp`, and the space-delimited `ivedaai:read` scope.
- Valid time claims, token age at most one hour, and lifetime at most one hour.

Opaque tokens and tokens for other resources are rejected. JWKS requests do not follow redirects,
are limited to 64 KiB and three seconds, and use the library's rotation/cache behavior. JWT
validation does not perform online revocation/introspection. An otherwise valid token may remain
usable until expiry. To revoke a mapped user immediately at this service, remove its subject
mapping and restart the instance; restart closes active requests. Disconnecting a client alone
does not invalidate its JWT. Production rollout must establish the required revocation policy.

## Configuration and startup

Build with `npm ci` and `npm run build`. Use the native IvedaAI configuration above, or this
alternative JWT configuration with values supplied by the identity-provider operator. Keep either
file **outside the repository**:

```json
{
  "publicUrl": "https://mcp.customer.example/mcp",
  "issuer": "https://identity.customer.example/",
  "jwksUrl": "https://identity.customer.example/keys",
  "upstreamOrigin": "https://ivedaai.customer.example",
  "port": 3000,
  "subjects": [
    {
      "subject": "stable-subject-from-the-identity-provider",
      "username": "dedicated-ivedaai-user",
      "password": "replace-in-protected-configuration"
    }
  ]
}
```

The subject is the identity provider's stable `sub` claim, not a model-provided username or an
assumed email address. Exact issuer spelling, including a trailing slash, matters. Duplicate
subjects and unknown configuration fields are rejected. All configured URLs require HTTPS;
the upstream is an origin without a path. The public MCP path must be `/mcp`.

Start the built entry point with one configuration-file argument:

```text
node /absolute/path/to/dist/http.js /protected/path/customer.json
```

The listener binds **only to 127.0.0.1**. Place a trusted HTTPS reverse proxy on the same host,
forwarding `/mcp` and `/.well-known/oauth-protected-resource` to the configured port. For native
IvedaAI login also forward `/authorize`, `/login`, `/token`, `/revoke`,
`/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/mcp`. Preserve the
canonical public Host header or use the loopback host/port. Forward Authorization without logging
it. The service does not trust forwarded identity, customer-route or upstream-URL headers.
Configure the proxy's own connection/rate limits and trusted certificates; no proxy, DNS record
or certificate is provisioned by this package. Internal HTTP is confined to loopback.

MCP Origin headers, when present, must match the public endpoint's origin. This endpoint is for
server-to-server MCP clients, including the backend of a browser AI app; it does not expose a
cross-origin browser JavaScript API or permissive CORS. JWKS and IvedaAI certificate verification
stay enabled. Configure approved private-CA trust on the runtime host where necessary.

For an installation using a private CA or a dedicated self-signed certificate, supply its public
certificate bundle through `upstreamTls.caFile` (an absolute local path, at most 64 KiB). Obtain and
verify that certificate through the installation administrator. If the connector reaches an IP
address but the certificate names a DNS host, `upstreamTls.serverName` can specify that exact name:

```json
"upstreamTls": {
  "caFile": "/protected/customer-ca.pem",
  "serverName": "ivedaai.internal.example"
}
```

The origin still fixes the network destination. The override is used for TLS SNI and hostname
verification against the supplied CA; it does not disable certificate, expiry or hostname checks.
Trust is confined to each upstream request's dispatcher and is never applied to JWKS requests or
the whole machine. Include public certificates only, never private keys. Restart after changing
the CA bundle. Prefer certificates whose names already match the configured upstream URL.

Use an unprivileged dedicated OS account and protect the configuration from other users.
Complete any IvedaAI first-login password change before starting. Restart to apply configuration
changes. Do not set a custom `IVEDAAI_SWAGGER_PATH` for the HTTP entry point.

## Protocol and limits

- `GET /.well-known/oauth-protected-resource` publishes the public resource, issuer and read scope.
- MCP requests require an Authorization bearer token on every call, including discovery.
  Invalid tokens receive 401 and a discovery challenge; unmapped subjects or missing scope receive 403.
- `POST /mcp` accepts JSON and returns JSON MCP responses. GET/DELETE at `/mcp` return 405 after
  authentication. No resumable SSE stream, legacy SSE endpoint or session identifier is offered.
  Supplied session identifiers are rejected; they never grant access.
- Bodies are capped at 256 KiB; compressed bodies are rejected. At most 16 ordinary requests run concurrently,
  with at most four per mapped subject. The request deadline is 30 seconds, upstream timeout 25 seconds.
- Native login reserves two additional slots for exact `POST /revoke` requests, so revocation
  remains reachable when the 16 ordinary slots are occupied. Those slots have the same deadline,
  Host/Origin checks and OAuth client/token validation; further revocation requests receive 503.
  This is bounded headroom under ordinary MCP load, not a guarantee against denial of service.
- Request closure and service shutdown abort that request's upstream work. Cross-request MCP
  cancellation notifications do not cancel another stateless request; no resumable operation state
  is retained. A timed-out or disconnected write may already have reached IvedaAI: inspect the
  resulting state before retrying. Cancellation and revocation cannot undo an accepted action.

## Validation and remaining release gates

Tests use generated signing keys, two isolated mock customer servers with overlapping camera IDs,
two application accounts and a real SDK HTTP client. They check discovery, issuer/audience/time/
signature/scope validation, account mapping, camera denials, write refusal, invalid host/origin,
duplicate authorization headers, body limits and absence of session authority.

Native-login tests additionally cover form binding/consent, failed passwords, PKCE, client/resource/
callback binding, code replay/expiry, token rotation/reuse, revocation and login-attempt limits.
Existing IvedaAI credentials also passed a controlled live login/read/refresh/revoke sequence.

Local reliability tests fill all 16 ordinary slots, verify excess requests are rejected before
upstream login, then revoke one grant and verify its upstream requests close while other grants
remain usable. They also cover the separate revocation bound, abandoned-request cleanup and
account limits shared across multiple grants. Four consecutive 16-call mock bursts preserve
account ownership and recover capacity; the 64 tool calls cause 64 upstream logins, confirming
the preview's per-request authentication cost. These are functional load checks, not production
throughput or latency measurements.

Before a customer pilot, configure the approved AI client and callback, verify the chosen account
login flow and TLS through the actual proxy, and test linking and representative reads in the
target browser AI app; confirm revocation and user permissions; and measure upstream login and
concurrency behavior. No production-readiness or browser-client compatibility claim follows from
local mock tests or the loopback live test. For a private ChatGPT stdio tunnel pilot, see [CUSTOMER-PILOT.md](CUSTOMER-PILOT.md).
