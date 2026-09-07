# IvedaAI team beta quickstart

Your pilot operator supplies the connection URL, installation name, availability,
approved test camera and support contact. These details must be filled in before invitations;
the repository does not provide a hosted service. Use your own IvedaAI account.

## Connect

1. Confirm your ChatGPT workspace permits the pilot connection. Follow the current
   [OpenAI connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)
   to add the operator-supplied MCP endpoint and select OAuth.
2. Use automatic OAuth discovery for ChatGPT. Leave manual client ID and secret fields blank.
   ChatGPT callbacks are validated automatically through its client metadata; no callback needs
   to be sent to the operator. Other AI clients may require manual registration.
3. Sign in on the IvedaAI connector page. Enter the company-approved IvedaAI server URL
   (the field starts empty) and your credentials only on that page, never in chat.
   One connection uses one configured server; create a separate connection for another server.
   Grant read access. Grant change access only if you intend to use the enabled actions.
4. Review the discovered tools, start a new conversation and select the IvedaAI connection.
5. Ask for a camera status without changing it. Report any access or setup error to the operator.

## Try these workflows

- “Show the five most recent alerts and explain what each was for. Include the camera,
  event time and timezone, type and alert ID.”
- “Summarize the last 24 hours in my timezone, including the most active cameras and alert types.”
- “Show the stored image for alert [ID].” A stored alert image is different from a live frame.
- “Show the current snapshot from [camera name].” A snapshot is a single image, not a video stream.
- With change access and an operator-approved idle test camera: “Read camera [ID] first.
  If it is Idle, start analytics, verify Processing, stop analytics, and verify Idle.
  If it is already Processing, leave it unchanged and report that the test was skipped.”

Check the target and requested change before approving an action. If the name is ambiguous,
identify the intended camera first. Do not stop another camera to free license capacity.
Enabled actions are limited by both operator policy and your IvedaAI permissions.

## Interpret results

Alert counts are records, not necessarily unique incidents. Recognition records do not verify
a person's identity. An unresolved alert does not establish an ongoing threat. Check summaries
and underlying records before operational decisions. Missing images and empty windows are valid
outcomes; the assistant should explain them without inventing evidence.

## Refresh, reconnect and get help

After an operator update, refresh the connection's tools and start a new conversation. If asked
to reconnect, sign in again. Default memory-only grants last one hour and end on restart.
Operators can enable encrypted persistent grants for up to seven days, surviving restarts.
The operator will tell you which setting applies. Expiry, revocation, or an address/policy
change can require a new sign-in; refreshing tools does not extend the grant deadline. A stopped pilot or unreachable upstream needs operator
attention; repeated password submissions will not restore its network connection.

For support, include time/timezone, prompt, expected result and redacted error. Do not post
credentials, tokens or sensitive camera media in general channels. To leave the pilot, disconnect
the app and ask the operator to verify access removal if necessary.

Unattended ChatGPT schedules that write to cameras have not been validated. Test interactive
workflows first; do not rely on this beta for critical scheduled camera control.
