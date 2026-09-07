# Encrypted persistent grants

Native IvedaAI OAuth can optionally retain a connection across process restarts for a fixed
1–168 hours. Five-minute access tokens and rotating refresh tokens remain unchanged. Renewal
revalidates the upstream account, preserves the selected server and cannot increase scopes.
The deadline does not slide on use. Default deployments remain memory-only for one hour.

## Enable on a single Linux server

Stop the service first. Provision a dedicated private state directory and a separate key:

```sh
sudo install -d -o ivedaai-mcp -g ivedaai-mcp -m 0700 /var/lib/ivedaai-mcp
sudo sh -c 'umask 077; test ! -e /etc/ivedaai-mcp/grants.key && openssl rand 32 > /etc/ivedaai-mcp/grants.key'
sudo chown root:ivedaai-mcp /etc/ivedaai-mcp/grants.key
sudo chmod 0640 /etc/ivedaai-mcp/grants.key
```

Never overwrite an existing key. Add this field to the native customer configuration:

```json
"persistentGrants": {
  "file": "/var/lib/ivedaai-mcp/grants.enc",
  "keyFile": "/etc/ivedaai-mcp/grants.key",
  "lifetimeHours": 168
}
```

The supplied systemd unit includes `StateDirectory=ivedaai-mcp` and
`StateDirectoryMode=0700`, allowing this directory under `ProtectSystem=strict`.
Apply those settings to existing units with a drop-in, run `systemctl daemon-reload`, then
start the service. Users reconnect once; old memory-only grants cannot be recovered.
The login page discloses encrypted credential retention and its duration.

## Operational boundaries

- AES-256-GCM authenticates encrypted snapshots against the public MCP URL. Key and ciphertext
  must be separate. Restrict backups too; anyone with both can recover retained credentials.
- One process owns the store. No shared-volume replicas or network filesystem guarantees.
- `/revoke` removes the grant and aborts requests. A client must actually invoke revocation;
  deleting a client entry locally is not proof of server-side revocation.
- Upstream credential/account changes are checked during renewal and upstream authentication.
- Server/client/write-policy or lifetime configuration changes invalidate saved grants.
  Public URL/key changes require discarding the old store and reconnecting.
- Pending login forms and authorization codes do not survive restart; restart that login flow.
- Capacity is bounded: 200 sessions, 4,000 active access-token records, 50,000 refresh-token records and 16 MiB per snapshot.
  Used refresh records remain until grant expiry to detect replay. Very frequent refreshes or
  larger deployments can reach the bound earlier; reconnecting may require revoking old grants.
  Measure workload before expanding beyond a small team pilot. Snapshots are synchronous.
- A corrupt store, wrong key or `.pending` marker prevents startup. The marker means an interrupted
  write. Stop the service, preserve diagnostic files securely, discard the grant snapshot and
  its `.pending`/`.tmp` files, then restart and reconnect users. Do not restore an old snapshot
  or merely remove the marker, because doing so can revive revoked access.
- To revoke every connection, stop the service and remove the encrypted snapshot before restarting.
  To roll back to a build without persistence, also remove `persistentGrants` from configuration.

These changes make authorization renewable; they do not establish that ChatGPT scheduled tasks
can execute custom connector writes without an interactive approval. Test that separately before
relying on camera schedules. Critical camera scheduling should use an independently validated
scheduler with explicit device/action permissions and observable failures.

