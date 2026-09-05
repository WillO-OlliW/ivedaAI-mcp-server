import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TokenManager } from "./auth.js";
import type { SwaggerContext } from "./swagger.js";
import { executeOperation } from "./request.js";

export const SNAPSHOT_URI = "ui://ivedaai/snapshot-v2.html";
export const SNAPSHOT_HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px system-ui,sans-serif;margin:0;padding:16px;color:light-dark(#18212b,#eef2f6);background:light-dark(#fff,#18212b);color-scheme:light dark}h2{font-size:18px;margin:0 0 8px}p{margin:8px 0}img{display:block;width:100%;height:auto;max-height:640px;object-fit:contain;border-radius:8px}img[hidden]{display:none}.muted{opacity:.7}</style>
<h2 id="title">Camera snapshot</h2><p id="status" role="status">Waiting for the snapshot result…</p><img id="frame" hidden alt="Camera snapshot"><p class="muted" id="time"></p>
<script>
const frame=document.getElementById('frame'),status=document.getElementById('status');
let ready=false;
function resize(){if(ready)window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height:Math.ceil(document.body.getBoundingClientRect().height)}},'*');}
new ResizeObserver(resize).observe(document.body);
function render(envelope){
 const data=envelope?.structuredContent,media=envelope?._meta?.snapshotImage;
 if(!data||!Number.isSafeInteger(data.cameraId))return;
 frame.hidden=true;frame.removeAttribute('src');
 document.getElementById('title').textContent='Camera '+data.cameraId+' · Snapshot';
 document.getElementById('time').textContent=typeof data.retrievedAt==='string'?'Retrieved '+data.retrievedAt+' · Single frame, not a video stream':'';
 status.textContent=typeof data.message==='string'?data.message:'No snapshot was returned.';
 if(data.available===true&&media&&['image/jpeg','image/png','image/gif','image/webp'].includes(media.mimeType)&&typeof media.base64==='string'&&media.base64.length<=5592408&&/^[A-Za-z0-9+/]+={0,2}$/.test(media.base64)){
  frame.onload=()=>{frame.hidden=false;status.textContent='Snapshot received.';};
  frame.onerror=()=>{frame.hidden=true;frame.removeAttribute('src');status.textContent='The returned image could not be displayed.';};
  frame.alt='Snapshot from camera '+data.cameraId;frame.src='data:'+media.mimeType+';base64,'+media.base64;
 }
}
function compatibility(){
 const api=window.openai,meta=api?.toolResponseMetadata;
 render(meta?.mcp_tool_result??meta?.call_tool_result??{structuredContent:api?.toolOutput,_meta:meta});
}
window.addEventListener('message',event=>{
 if(event.source!==window.parent||event.data?.jsonrpc!=='2.0')return;
 const message=event.data;
 if(message.id==='snapshot-init'&&message.result){ready=true;window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*');resize();}
 if(message.method==='ui/notifications/tool-result')render(message.params);
 if(message.method==='ui/notifications/tool-cancelled'){frame.hidden=true;frame.removeAttribute('src');status.textContent='Snapshot request canceled.';}
});
window.addEventListener('openai:set_globals',compatibility);compatibility();
window.parent.postMessage({jsonrpc:'2.0',id:'snapshot-init',method:'ui/initialize',params:{appInfo:{name:'IvedaAI snapshot',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'}},'*');
</script></html>`;

/** Remote-only viewer: uses the current request's authenticated account and never publishes an image URL. */
export function registerSnapshotView(server: McpServer, ctx: SwaggerContext, manager: TokenManager) {
  const op = ctx.tags.flatMap(tag => tag.operations).find(op => op.id === "GET /api/streaming/{cameraId}/{type}.jpg");
  if (!op) return;
  server.registerResource("camera-snapshot-view", SNAPSHOT_URI, { mimeType: "text/html;profile=mcp-app" }, async () => ({
    contents: [{ uri: SNAPSHOT_URI, mimeType: "text/html;profile=mcp-app", text: SNAPSHOT_HTML,
      _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
        "openai/widgetDescription": "Displays the returned camera frame, or explains that no frame was returned." } }],
  }));
  server.registerTool("ivedaai_camera_snapshot", {
    title: "Show camera snapshot",
    description: "Fetch and display a current camera snapshot in an embedded viewer. Use when the user asks to see what a camera is seeing. First resolve a camera name to its ID with ivedaai_camera. Does not activate cameras. No-frame responses are reported explicitly; never invent an image or public image URL.",
    inputSchema: { cameraId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) },
    outputSchema: { cameraId: z.number().int().positive(), retrievedAt: z.string(), status: z.number().int().optional(), available: z.boolean(), message: z.string() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: SNAPSHOT_URI }, "openai/outputTemplate": SNAPSHOT_URI },
  }, async ({ cameraId }, extra) => {
    const retrievedAt = new Date().toISOString();
    try {
      const result = await executeOperation(manager, op, { path: { cameraId, type: "live" } }, undefined, extra.signal);
      const image = result.status >= 200 && result.status < 300 ? result.image : undefined;
      const message = image ? "Snapshot returned to the embedded viewer and attached as MCP image content."
        : result.status === 204 ? "The camera returned no current frame (HTTP 204). No snapshot is available to display."
        : result.status >= 400 ? "Snapshot request was denied or failed (HTTP " + result.status + ")."
        : "The response contained no complete supported image. No snapshot is available to display.";
      return {
        structuredContent: { cameraId, retrievedAt, status: result.status, available: !!image, message },
        content: [{ type: "text" as const, text: message }, ...(image ? [{ type: "image" as const, data: image.base64, mimeType: image.mimeType }] : [])],
        ...(image ? { _meta: { snapshotImage: image } } : {}),
        isError: result.status >= 400,
      };
    } catch {
      const message = "The snapshot request could not be completed. No image is available to display.";
      return { structuredContent: { cameraId, retrievedAt, available: false, message }, content: [{ type: "text" as const, text: message }], isError: true };
    }
  });
}
