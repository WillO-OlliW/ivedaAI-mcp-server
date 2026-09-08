```text
                         . . . SIGNAL // LOCKED . . .

                         [CAM]        [ALERT]        [RULE]
                            \            |            /
                             \           |           /
                    [FACE] ----\------ [ MCP ] ------/---- [LPR]
                               \         |         /
                                \        |        /
                               [SEARCH]  |  [ANALYSIS]
                                         |

██╗██╗   ██╗███████╗██████╗  █████╗  █████╗ ██╗    ███╗   ███╗ ██████╗██████╗ 
██║██║   ██║██╔════╝██╔══██╗██╔══██╗██╔══██╗██║    ████╗ ████║██╔════╝██╔══██╗
██║██║   ██║█████╗  ██║  ██║███████║███████║██║    ██╔████╔██║██║     ██████╔╝
██║╚██╗ ██╔╝██╔══╝  ██║  ██║██╔══██║██╔══██║██║    ██║╚██╔╝██║██║     ██╔═══╝ 
██║ ╚████╔╝ ███████╗██████╔╝██║  ██║██║  ██║██║    ██║ ╚═╝ ██║╚██████╗██║     
╚═╝  ╚═══╝  ╚══════╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝    ╚═╝     ╚═╝ ╚═════╝╚═╝     

                     |                                       |
                     |   VIDEO INTELLIGENCE <-> AI TOOLS     |
                     +-------------------+-------------------+
                                         |
                               316 API OPERATIONS
                                  63 MCP TOOLS

                           :: DECODE // OBSERVE // ACT ::
```                                                                                                                                                
# ivedaai-mcp-server

[![CI](https://github.com/WillO-OlliW/ivedaAI-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/WillO-OlliW/ivedaAI-mcp-server/actions/workflows/ci.yml)

Connect **IvedaAI 10.0** to an AI assistant to check cameras, summarize recent alerts, view
snapshots and stored alert images, and perform explicitly permitted actions.

**Status: team beta.** The authenticated browser connector is included in `main`. Actual ChatGPT
pilot checks have passed sign-in, camera reads, recent alerts, rendered images and approved camera
start/stop. A configured persistent connection also survived a service restart. These checks cover
specific workflows, not every API operation or every deployment.

## Choose how to connect

| Mode | Who it is for | Setup |
| --- | --- | --- |
| Hosted HTTP connector | Teams using ChatGPT or another compatible remote MCP client | An operator deploys the connector behind HTTPS; each user connects with their own IvedaAI account. |
| Local stdio server | Clients that launch a local MCP process | Build the repository and configure the client to launch `dist/index.js`. |

Each company runs its own connector. An operator can configure several approved IvedaAI instances,
but **one connection selects one server**. This repository does not provide a public hosted service.

### Connect to an existing hosted server

No local installation is needed for users of an operator-hosted connector.

1. Obtain the MCP URL from your operator, for example `https://mcp.customer.example/mcp`.
2. Add it to your AI client's remote MCP connections and choose OAuth.
3. For ChatGPT, leave manual client ID and secret fields blank. The connector validates ChatGPT's
   published client metadata and callbacks automatically; users do not send callback URLs to the operator.
   Other clients may require explicit registration.
4. On the connector's HTTPS sign-in page, enter an approved **IvedaAI server URL** and your own
   IvedaAI credentials. The server field starts empty. Credentials belong on this page, never in chat.
5. Consent to the requested access, select the connection in a new conversation, and try a camera read.

Available connection controls depend on the client's account and workspace settings. See the
[team quickstart](docs/TEAM-QUICKSTART.md) for onboarding, test prompts and feedback guidance.

Try:
- “List three cameras with their IDs and current status. Change nothing.”
- “Show the five most recent alerts from the last 24 hours and explain what each was for.”
- “Show the current snapshot from [camera name].”
- “Show the stored image for alert [ID].”

Specify a timezone for time-window questions. A snapshot is a single frame, not a live video feed.
Image rendering depends on client support and whether IvedaAI returns an image.

### Deploy a connector for your company

Start with the [hosting guide](docs/HOSTING.md) and [HTTP configuration](docs/REMOTE.md).
Operators configure the public HTTPS endpoint, upstream connectivity and certificate trust,
[approved IvedaAI servers](docs/SERVER-SELECTION.md), and any
[permitted write operations](docs/CUSTOMER-WRITE-POLICY.md).

The HTTP entry point is:

```sh
node /absolute/path/to/ivedaAI-mcp-server/dist/http.js /protected/path/customer.json
```

It binds to loopback behind a reverse proxy. The AI client's backend must be able to reach the MCP
endpoint, and the MCP host must be able to reach the selected IvedaAI instance. A user's browser
being on a VPN does not by itself give the remote AI service access to a private MCP endpoint.

Existing IvedaAI login is supported without a separate identity provider. HTTP access defaults to
read-only; writes require an operator allowlist, a write grant and user consent. IvedaAI account
permissions remain authoritative. Local-file uploads and collection-wide deletes remain disabled
over HTTP.

**Connection lifetime:** the default is one hour in memory, ending on restart. Operators can enable
[encrypted persistent grants](docs/PERSISTENT-GRANTS.md) for a fixed period of up to seven days,
surviving ordinary service restarts. This retains IvedaAI credentials encrypted on the connector.
Access tokens last up to five minutes and refresh tokens rotate within the fixed grant lifetime;
use does not extend the deadline. Expiry, revocation or relevant configuration changes require
another sign-in.

### Build from source and use stdio

Use Node 22.16.0+ in the 22.x line, or Node 24+:

```sh
git clone https://github.com/WillO-OlliW/ivedaAI-mcp-server.git
cd ivedaAI-mcp-server
npm ci
npm run build
```

Configure a local MCP client to launch the built server:

```json
{
  "mcpServers": {
    "ivedaai": {
      "command": "node",
      "args": ["/absolute/path/to/ivedaAI-mcp-server/dist/index.js"],
      "env": {
        "IVEDAAI_BASE_URL": "https://ivedaai.example.com",
        "IVEDAAI_USERNAME": "your-username",
        "IVEDAAI_PASSWORD": "your-password",
        "IVEDAAI_READ_ONLY": "true"
      }
    }
  }
}
```

Replace the path and account settings; protect this configuration because it contains credentials.
For Windows JSON paths, use forward slashes or escaped backslashes. Restart the client after updating
its configuration. The server speaks JSON-RPC over stdin/stdout and sends diagnostics to stderr.

`IVEDAAI_BASE_URL` is the upstream **IvedaAI address**, not the MCP connection URL.
The environment settings below apply to stdio; HTTP uses its separate protected configuration file.

The npm registry returned 404 when checked on 2026-09-04, and the team-beta merge did not publish a
package. Use the source installation above unless a published release has been independently verified.

## Beta scope and remaining checks

- Coworker onboarding, two real simultaneous server connections, second-instance alert/image reads,
  full VPS reboot/rollback, broader load and other AI clients still need acceptance testing.
- Persistent grants support one process; high-availability replication is not implemented.
- IvedaAI MFA challenges and federated sign-in flows are unsupported; complete required account setup
  and first-login password changes in IvedaAI first.
- Unattended scheduled connector writes and their approval behavior are unverified. Longer-lived
  authorization does not establish that an AI client's scheduler supports camera-control actions.
- Coordinate write tests using explicitly approved idle cameras. Confirm the final state and inspect
  uncertain results before retrying. An operation allowlist does not restrict specific camera IDs.

The bundled API defines 316 operations. The default stdio surface exposes 295 through 63 resource
tools plus three helpers; 21 collection-wide DELETEs are withheld. HTTP has a narrower surface based
on its policy and includes dedicated image tools. See [design](docs/DESIGN.md#design) and
[HTTP details](docs/REMOTE.md) for the applicable limits.

## Stdio: read-only first

If you are evaluating this, or connecting it to anything you would not want to write to, start here:

```json
"env": { "IVEDAAI_READ_ONLY": "true", "IVEDAAI_BASE_URL": "…", "IVEDAAI_USERNAME": "…", "IVEDAAI_PASSWORD": "…" }
```

Mutating operations are withheld from the tool list. Reads include GETs and the three verified
query-only POSTs for alert statistics, search, and latest alerts. The two write-oriented convenience
tools are withheld too.

## Stdio configuration

Only the first three are required.

| Variable | Default | Description |
| --- | --- | --- |
| `IVEDAAI_BASE_URL` | — | Origin of your IvedaAI server, e.g. `https://ivedaai.example.com`. No path. |
| `IVEDAAI_USERNAME` | — | IvedaAI account username. |
| `IVEDAAI_PASSWORD` | — | IvedaAI account password. |
| `IVEDAAI_READ_ONLY` | `false` | `true` serves GETs and verified query-only alert POSTs; mutating operations and the two write-oriented convenience tools are withheld. |
| `IVEDAAI_ALLOW_COLLECTION_DELETE` | `false` | `true` permits the 21 DELETEs that name no record — see [Destructive operations](#destructive-operations). |
| `IVEDAAI_REDACT_SECRETS` | `true` | Masks credential-shaped fields (keys, secrets, passphrases) in responses. `false` disables it. |
| `IVEDAAI_ALLOW_INSECURE_TLS` | `false` | `true` skips TLS certificate verification, for on-prem deployments with self-signed certificates. Traffic stays encrypted; the certificate is not checked. Scoped to this server's requests, not process-wide. |
| `IVEDAAI_TIMEOUT_MS` | `30000` | Per-request timeout, including reading the response body. Several IvedaAI endpoints block rather than failing fast when a camera is unreachable, so this matters. |
| `IVEDAAI_MAX_RESPONSE_BYTES` | `28672` | Response body bytes read before truncating. Sized for what a model client can receive, not for what the API can send — bisected against a real client, 38 KB reached the model and 57 KB did not. Larger responses come back flagged `truncated` with a note saying to narrow the request. |
| `IVEDAAI_INLINE_IMAGES` | `true` | Image responses are handed to the client as viewable images. `false` returns only a description (type, size, filename). |
| `IVEDAAI_MAX_IMAGE_BYTES` | `4194304` | Separate budget for images, because a client charges for an image by its dimensions rather than the length of its base64 — holding them to the response cap above would truncate every one for no saving. An image larger than this is described rather than attached, since a partly-read image is a corrupt file, not a smaller one. |
| `IVEDAAI_UPLOAD_ROOT` | — | Directory containing files the server may upload. Local-file uploads are disabled until this is set. Symlinks that escape the directory are refused. |
| `IVEDAAI_ALLOW_UNCONFINED_UPLOADS` | `false` | Emergency compatibility escape hatch. `true` permits uploads outside a configured root, but still refuses conventional credential paths, known Linux virtual kernel filesystems such as procfs and sysfs, non-regular files, and oversized files. Prefer `IVEDAAI_UPLOAD_ROOT`. |
| `IVEDAAI_MAX_UPLOAD_BYTES` | `67108864` | Maximum bytes read from an approved upload file. Reads are descriptor-bound and stop at the cap even if the file grows after validation. |
| `IVEDAAI_CLIENT_ID` / `IVEDAAI_CLIENT_SECRET` | — | Sent as HTTP Basic auth on the token request, if your deployment requires client credentials. |
| `IVEDAAI_ALLOW_LOSSY_UPDATE` | `false` | `true` disables the [lossy-update guard](docs/DESIGN.md#the-lossy-update-guard). Intended for the maintainers' CRUD probe; leave it unset. |
| `IVEDAAI_SWAGGER_PATH` | bundled | Path to an alternate OpenAPI 3 document, if your deployment's API differs from the bundled one. |

Copy [`.env.example`](.env.example) if you prefer a file. The server does not load `.env` automatically:
export its values into the environment or run a local build with `node --env-file=.env dist/index.js`.

### Authentication

OAuth2 password grant against `POST {base}/ainvr/api/oauth2/token`. The server logs in on first use,
caches the access token, and refreshes it as it nears expiry. Note that the token endpoint is rate
limited: a client that starts a fresh process per request will hit it.

### Destructive operations

Twenty-one of this API's DELETEs take no id in the path — `DELETE /api/cameras` versus
`DELETE /api/cameras/{cameraId}`. The only subject would come from an optional request body, and what
the API does when that body is omitted is not specified anywhere. One character of difference, and
the mistake cannot be undone.

**They are withheld by default**: absent from the tool descriptions and the `operation` enum, and
refused with an explanation naming the single-record alternative if a client sends one anyway. Set
`IVEDAAI_ALLOW_COLLECTION_DELETE=true` to permit them. `IVEDAAI_READ_ONLY=true` overrides that.

See [SECURITY.md](SECURITY.md) for the rest of the defaults, and for what leaves your deployment.

## Using it

Grouped resource tools take an `operation` and the arguments that operation needs; dedicated helpers have their own schemas:

```json
{ "operation": "GET /api/cameras", "query": { "size": 20, "nameContains": "lobby" } }
```

- **[Usage guide](docs/USAGE.md)** — calling conventions and worked workflows: onboarding cameras,
  alert rules, analysis jobs, face and licence-plate watchlists.
- **[Tool reference](docs/TOOLS.md)** — every tool, operation and parameter.
- **[Design and behaviour](docs/DESIGN.md)** — why one tool per resource type, what the server does
  about partial updates the API silently discards, and the response format.

If a model needs the exact shape of a request body, `ivedaai_get_schema` returns it on demand rather
than every tool description carrying it.

## Requirements

Node 22.16.0+ in the 22.x line, or Node 24+, and an IvedaAI 10.0 deployment. Use the latest patched Node 22 or 24 LTS
release in production; Node 20 is no longer supported. The bundled API document is 10.0; point
`IVEDAAI_SWAGGER_PATH` at your own if you run something else.

Earlier Node 22 versions and Node 23 are unsupported because request deadlines depend on the
`AbortSignal.any()` timeout fix included in [Node 22.16.0](https://nodejs.org/en/blog/release/v22.16.0).
CI covers the minimum supported Node 22 version and Node 24.

## Production operation

For stdio, each MCP client starts its own process and communicates over stdin/stdout; that entry
point has no HTTP listener. The separate [HTTP connector](docs/REMOTE.md) uses existing IvedaAI login
behind an operator-managed HTTPS proxy. Neither mode provisions a database, container or separate
health endpoint. Successful MCP initialization and a small authorized read provide integration checks.

Use HTTPS with a valid certificate, a dedicated IvedaAI account with only the required application
permissions, and read-only mode for monitoring. The server adds read-only, collection-delete,
lossy-update, and upload restrictions; record-level authorization remains IvedaAI's responsibility.
Treat client configuration as a secret and approve an upload directory only when uploads are needed.
After release, pin the approved npm version in your client configuration for reproducible installs.

Outbound redirects are refused. Configure the final deployment origin directly. Incomplete or
malformed JSON is withheld when redaction is enabled, since its credential fields cannot be
reliably masked. Reduce the page size or narrow the filter; SSE reads retain only complete,
redacted events. Cancellation and client disconnect stop further API work, but cannot undo an
application write already received. Inspect uncertain writes before retrying.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Upgrading the API document?
`npm run diff:spec -- --against <new-spec.json>` reports what changed and, more usefully, whether
anything this repo records now points at an operation that no longer exists.

## License

MIT — see [LICENSE](LICENSE).
