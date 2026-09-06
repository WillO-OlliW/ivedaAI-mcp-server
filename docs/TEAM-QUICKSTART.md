# IvedaAI team beta quickstart

Your pilot operator supplies the connection URL, installation name, availability,
approved test camera and support contact. These details must be filled in before invitations;
the repository does not provide a hosted service. Use your own IvedaAI account.

## Connect

1. Confirm your ChatGPT workspace permits the pilot connection. Follow the current
   [OpenAI connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)
   to add the operator-supplied MCP endpoint and select OAuth.
2. Use the supplied client configuration. If ChatGPT shows a callback URL, give that exact
   URL to the operator for registration. Do not invent an endpoint or client secret.
3. Sign in on the IvedaAI connector page. Enter credentials only on that page, never in chat.
   Grant read access. Grant change access only if you intend to use the enabled actions.
4. Review the discovered tools, start a new conversation and select the IvedaAI connection.
5. Ask for a camera status without changing it. Report any access or setup error to the operator.

## Try these workflows

- “Show the five most recent alerts and explain what each was for. Include the camera,
  event time and timezone, type and alert ID.”
- “Summarize the last 24 hours in my timezone, including the most active cameras and alert types.”
- “Show the stored image for alert [ID].” A stored alert image is different from a live frame.
- “Show the current snapshot from [camera name].” A snapshot is a single image, not a video stream.
- With change access and an approved test target: “Start analytics on camera [ID], verify its
  state, then stop it and verify that it returns to its original state.”

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
to reconnect, sign in again. The current native connector keeps grants in memory: a restart ends
existing grants, and grants also expire. A stopped pilot or unreachable upstream needs operator
attention; repeated password submissions will not restore its network connection.

For support, include time/timezone, prompt, expected result and redacted error. Do not post
credentials, tokens or sensitive camera media in general channels. To leave the pilot, disconnect
the app and ask the operator to verify access removal if necessary.
