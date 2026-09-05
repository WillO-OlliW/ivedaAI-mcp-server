# Host a customer browser pilot

These templates prepare one Linux host for one IvedaAI installation. They do not provision a
server, domain or account. The configuration has been checked against the connector's schema;
the systemd and Caddy deployment still needs acceptance on the chosen Linux host. This remains a
preview, with the release gates in [REMOTE.md](REMOTE.md).

## Required operator inputs

- A managed Linux host running systemd, with Node matching `package.json` and Caddy installed.
- A stable DNS hostname controlled by the operator, pointing to that host, with inbound ports
  80/443 available for this Caddy setup. Keep port 3000 private to loopback.
- Network access from that host to the customer's IvedaAI HTTPS origin. For private installations,
  place it inside the approved network or provide an approved VPN route.
- The AI client's exact OAuth callback, and the existing IvedaAI accounts allowed to use it.

Caddy's [automatic HTTPS](https://caddyserver.com/docs/automatic-https) manages certificates for
the configured hostname. The [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
forwards all MCP and OAuth paths to the same local process. No URL rewrite is needed.

Without a hosting account or hostname, use the temporary authorized pilot for testing. Its address
and availability are temporary. A stable address requires an operator-owned deployment; no account
or purchase is created by these instructions.

## Install the reviewed build

Have the operator install a reviewed checkout at `/opt/ivedaai-mcp`. Run `npm ci`, `npm run build`,
`npm run typecheck` and `npm test` there as the deployment user, before making the deployed files
read-only to the service account. Record the exact commit and retain the previous reviewed build
for rollback. Do not deploy an unreviewed moving branch automatically.

Create the dedicated `ivedaai-mcp` OS user/group with no interactive login. The account needs read
access to the build and configuration, and outbound access to IvedaAI; it does not need write access
to the checkout. The example service expects Node at `/usr/bin/node`; adjust that absolute path to
the installed runtime if needed.

Copy [customer.example.json](../deploy/customer.example.json) to `/etc/ivedaai-mcp/customer.json`.
Replace all example hosts and the callback. Keep that configuration outside source control, owned
by root with group `ivedaai-mcp`, mode `0640`, inside a directory with mode `0750`. No IvedaAI
password belongs in native-login configuration. For private CA certificates, configure
`upstreamTls` as described in [REMOTE.md](REMOTE.md#configuration-and-startup); put the public CA
bundle somewhere the service can read, such as `/etc/ivedaai-mcp/customer-ca.pem`.

The example defaults to read access. To enable the workflows validated in the pilot, explicitly
set:

```json
"allowedWriteOperations": [
  "POST /api/cameras/{cameraId}/jobs",
  "PATCH /api/cameras/{cameraId}",
  "PATCH /api/alertRules/{alertRuleId}"
]
```

These entries permit operation types across records the signed-in account can access. They do
not restrict access to a test camera or rule. Use restricted IvedaAI accounts and enable only
workflows intended for that customer. Users must consent to write access; read grants still
cannot invoke these actions. Rule edits should preserve the existing condition, schedule and
delivery settings; see [alert-rule update guidance](USAGE.md).

Install [ivedaai-mcp.service](../deploy/ivedaai-mcp.service) as
`/etc/systemd/system/ivedaai-mcp.service`. Validate and start it:

```sh
sudo systemd-analyze verify /etc/systemd/system/ivedaai-mcp.service
sudo systemctl daemon-reload
sudo systemctl enable --now ivedaai-mcp
sudo systemctl status ivedaai-mcp --no-pager
```

Replace the hostname in [Caddyfile](../deploy/Caddyfile), install it as `/etc/caddy/Caddyfile`,
then validate it before reloading Caddy:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Use one connector process. Do not load-balance multiple replicas: native grants live in memory
and are not shared. Keep access-log request bodies, authorization headers, cookies and OAuth query
strings out of logs. Do not enable Caddy debug logging for credential-bearing traffic.

## Verify the public connection

Check the real hostname, not the example values:

```sh
curl --fail --silent --show-error https://mcp.customer.example/.well-known/oauth-authorization-server
curl --fail --silent --show-error https://mcp.customer.example/.well-known/oauth-protected-resource/mcp
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://mcp.customer.example/mcp
```

Metadata should return 200 with the exact public issuer/resource. The unauthenticated MCP probe
should return 401. These checks establish routing and authentication challenge availability,
not successful upstream login. Test the browser flow next:

1. Create or edit the AI app connection with the public `/mcp` URL and OAuth. Register its exact
   callback in the protected configuration, restart the service, and enter the matching client ID
   with no client secret for this public-client flow. After refreshing tools, start a new
   conversation; an existing ChatGPT conversation can retain older operation definitions.
2. Sign in using the intended IvedaAI account. Read an allowed camera and verify a denied record
   with a restricted account. Refresh the connection's tools after configuration changes.
3. Display a snapshot using `ivedaai_camera_snapshot`; verify an actual image card with the
   client's CSP enforcement enabled. A successful text response alone is insufficient.
4. On authorized test records, change one camera field, read it back, then restore it. Edit an
   owned disabled alert rule, read back the condition and camera association, then restore it.
   Never retry an uncertain write before inspecting the resulting state.
5. Confirm a read-only grant rejects those same writes. Test revoke, token refresh, full grant
   expiry and reconnect after a service restart, then measure expected concurrent upstream load.

Access tokens last up to five minutes; rotating refresh works within a grant of at most one hour.
After that, the user signs in again. Restarting or rolling back the process invalidates all native
grants. A stable hostname does not provide durable sign-in sessions. To roll back, stop the service,
restore the previous reviewed build/configuration, start it and repeat metadata/login/read checks.
Stop the service and close the public route to end the pilot.

## Outbound tunnel alternative

OpenAI's [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
can reach a private HTTP or stdio MCP process using outbound HTTPS. It requires a provisioned
OpenAI Platform tunnel, runtime key, suitable permissions and a workspace association. It does not
automatically tunnel the OAuth authorization server, so this connector's browser login endpoints
still need an approved reachable route. Switching to shared-account stdio changes the identity
model; it does not preserve each user's existing IvedaAI login. See [CUSTOMER-PILOT.md](CUSTOMER-PILOT.md)
for the separately scoped stdio pilot. Compatibility with other AI clients requires separate tests.
