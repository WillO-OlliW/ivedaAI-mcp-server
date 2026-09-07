# Customer write policy proposal

This proposal separates routine camera control from broader maintenance. It does not change a
running customer's permissions. The example installation still defaults to no writes, and the
existing IvedaAI account's privileges and record grants remain authoritative.

## Proposed profiles

| Profile | Exact write operations | Intended use and limits |
| --- | --- | --- |
| Read access | Empty `allowedWriteOperations` | Reporting and snapshots; no configured writes. |
| Camera control | `POST /api/cameras/{cameraId}/jobs` | Start/stop analytics on cameras the account may control. Starting an already-processing camera can restart its job; read status first. |
| Maintenance | Camera control, `PATCH /api/cameras/{cameraId}`, `PATCH /api/alertRules/{alertRuleId}` | Operators authorized to change camera and rule configuration. These are broad PATCH permissions, not name/cooldown-only access. |

Use [camera-control.policy.json](../deploy/camera-control.policy.json) as the initial write-enabled
customer profile when the intended workflow is start/stop. Use
[maintenance.policy.json](../deploy/maintenance.policy.json) only when the operator's role includes
broader configuration changes. These are **configuration fragments**: copy the
`allowedWriteOperations` property into the protected installation configuration described in
[HOSTING.md](HOSTING.md). They are not standalone server configuration files. Restart and reconnect
after changes; refresh the AI client's tools and start a new conversation.

The allowlist selects operation types, not camera IDs, rule IDs, request fields, notification
destinations or allowed values. Write consent applies to the configured operations. A camera
rename test does not establish permission to change recording or connectivity; a disabled-rule
test does not establish readiness for enabling delivery. Descriptions guide the assistant but
cannot enforce these distinctions. Customers needing a rename-only or disabled-rule-only role
need narrower server-side actions or equivalent upstream field-level permissions before enabling
these broad PATCH operations.

Multiple grants for one account share its request limit. Separate connector instances can expose
different profiles, but are not substitutes for correct account permissions. Never configure a
shared administrator identity to simulate distinct users' authority.

## Effects and enablement decisions

| Area | Potential effect | Proposed decision |
| --- | --- | --- |
| Camera processing | Start, interrupt or stop analytics; consume licensed capacity | Camera-control profile, with status/target checks. |
| Camera and rule configuration | Change configuration beyond the limited fields tested; alter detection or delivery behavior | Separate maintenance role; specify fields and read back. |
| Alert acknowledgment, grouping, filters, tags and maps | Change workflow state, memberships or metadata; some operations affect multiple records | Keep off initially; candidate next workflows after account, scope and restoration tests. |
| ROI, lines, engine profiles/models, tracking and jobs | Change analysis behavior, resource use or running work | Keep off; validate each workflow and its affected cameras/jobs. All-jobs operations stay outside proposed profiles. |
| Face/plate targets and categories | Change recognition reference records, labels and category memberships | Keep off; require an explicit enrollment/update/removal workflow and tested account grants. Image enrollment also needs a supported remote upload design. |
| Trigger tests, reports and notification destinations | Send data or notifications to another system; a test may actually deliver | Keep off; establish exact destination/payload authority and inspect receipt before retrying. |
| Accounts, groups, API keys, passwords, MFA and identity providers | Change access or credentials; some endpoints perform authentication rather than mutate records | Keep out of routine customer profiles; retain the connector's existing-login flow. |
| Infrastructure, storage, certificates, modules, plugins and licensing | Change deployment-wide configuration, installed components or data destinations | Keep off; administrator workflow and deployment-specific validation required. |
| Record removal and cancellation | Remove records or stop work; associations and audit behavior vary | Keep off initially, including single-record deletes. Do not assume a successful status proves deletion or that recreation restores the original state. |
| Collection deletes and local-file uploads | Broad or underspecified deletion; access to connector-host files | Collection deletes remain rejected remotely; uploads remain unavailable. |
| Query-shaped POSTs outside the verified read-safe list | May query, process data, use credentials or have unverified side effects | Keep off pending semantic validation; HTTP POST alone is not proof of a write. |

The [complete operation inventory](WRITE-OPERATIONS.md) lists every non-GET operation outside the
verified read-safe POST list, including documented purpose and proposed decision. It is a review
artifact, not a new authorization engine. The runtime can accept other known non-read operations
when explicitly configured, except its existing collection-delete restriction; do not interpret
startup acceptance as workflow approval or a guarantee of single-record scope.

## Evidence and outstanding checks

The user reported successful camera start/stop in ChatGPT with restoration to Idle. Independently
operated ChatGPT Work tests renamed/restored a disposable camera and edited/restored a disabled
rule's name and cooldown. The rule's association, condition, schedule and triggers were preserved;
final names/cooldown/disabled state were independently read before fixture cleanup. Controlled
HTTP tests also denied writes to read grants. Automated tests preserve upstream account denials.

This evidence supports the named workflows in the authorized pilot. It does not validate all
fields accepted by PATCH, rule enablement/delivery through ChatGPT, production hosting, every
IvedaAI role or other AI clients. Those remain customer acceptance work.

For each additional workflow, record the exact operation and target scope, required account
privileges, before/after fields, expected external effects, how to detect an uncertain result,
and whether restoration is possible. Test read-grant denial and an upstream-denied account as
well as the allowed case. Reuse an existing explicit user authorization; request clarification
only when the target or consequential effect is outside that authorization.

## What ChatGPT should be told

Camera activation descriptions explain active/idle behavior and restart effects, and now make
clear that a capacity failure does not authorize stopping another camera. Camera
and alert-rule PATCH descriptions now explicitly state their broader scope, preservation and
read-back requirements. Trigger-test descriptions distinguish actual delivery from preview;
all-jobs descriptions point out deployment-wide scope. These guidance notes accompany the
existing write/destructive annotations and appear only for offered operations. Runtime scopes,
the operation allowlist and upstream permissions provide enforcement; prose is advisory.
