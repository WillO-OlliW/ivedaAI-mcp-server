# Browser connection readiness

## Verified team beta

The company-hosted native HTTP connector has passed a Lightsail Ubuntu 24.04 deployment with
verified HTTPS, automatic ChatGPT client metadata discovery, individual IvedaAI login, separate
read/change consent, recent alerts, snapshot display and camera start/stop with restoration.
Camera 155's latest browser test returned to Idle after job 450 was canceled.

One company runs each connector. Its configured server list may include multiple IvedaAI
instances. Each ChatGPT connection selects one instance at login. Automated tests verify
same-username isolation across two simulated servers, token refresh routing and rejection of
unconfigured destinations before credentials are transmitted. See [SERVER-SELECTION.md](SERVER-SELECTION.md).

The second real server has passed network and certificate validation; authenticated browser
acceptance is still pending. A coworker-only onboarding test and VPS reboot/rollback acceptance
also remain pending. Other AI clients, production capacity, and broader enabled writes need
separate validation. Do not interpret the full API inventory as a completed live test matrix.

## Deployment and authentication boundaries

Use [HOSTING.md](HOSTING.md), [REMOTE.md](REMOTE.md) and [TEAM-QUICKSTART.md](TEAM-QUICKSTART.md).
ChatGPT uses automatic CIMD without manual callbacks; other clients can use exact registered
public clients. DCR, persistent grants, replicated sessions and upstream MFA/federated login
are not implemented. Tokens refresh automatically within a one-hour grant; restart or expiry
requires reconnecting. The connector retains upstream credentials in process memory during
the grant. Operator-configured certificate verification is per server and remains enabled.

The MCP host must reach each configured upstream. Public HTTPS is supported; private servers
need routing from the MCP host. A user's laptop VPN does not provide that route to Lightsail.
Outbound tunnel/relay deployments and other client products require their own acceptance.
The alternative stdio tunnel in [CUSTOMER-PILOT.md](CUSTOMER-PILOT.md) uses one application
account and does not provide the native HTTP per-user login isolation.

## Beta release gates

- Complete second-server authenticated reads, images and two-connection isolation.
- Require passing CI on the reviewed release commit and reconcile deployment artifacts.
- Document known limits and identify the operator/support contact.
- Keep coworker onboarding, reboot/recovery and production capacity checks explicitly pending
  until evidence is recorded. A beta tag is not a general production-readiness claim.
