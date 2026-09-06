# Selecting an IvedaAI server at login

Each company hosts its own MCP deployment. Each OAuth grant is bound to exactly one IvedaAI instance. Different ChatGPT connections can select different instances and use separate credentials and consent.

The existing `upstreamOrigin` remains the prefilled default. Add optional company-managed choices in `customer.json`:

```json
{
  "upstreamOrigin": "https://hq.example.com",
  "upstreamServers": [
    { "name": "Warehouse", "upstreamOrigin": "https://warehouse.example.com" },
    { "name": "Branch", "upstreamOrigin": "https://branch.example.com" }
  ]
}
```

These fields are part of the existing configuration, not a complete replacement file. Each additional server can have its own `upstreamTls` settings (public CA file and optional certificate server name), using the same format as the default server. Never disable certificate verification. Private addresses work if reachable from the MCP host and their certificates can be validated.

The login page lets users select or type a configured address. Unconfigured addresses are rejected before credentials are sent. This is intentionally not an unrestricted URL proxy. The company's operator controls this list; no registration with the software author is involved. Write-operation policy applies across the deployment, and user permissions and consent still restrict each connection.

To use two instances, create two ChatGPT connections to the same MCP URL, label them by site, and select the matching server during each login. The selected destination is stored with the grant and retained during token refresh and API requests. Reconnecting requires choosing the server again; the default remains prefilled. Automatic ChatGPT client metadata discovery needs no manual callback setup.

After changing the server list, restart the MCP service. Existing grants are process-local, so users must reconnect. Never put IvedaAI passwords in this configuration.
