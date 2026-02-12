import type { Context } from "hono";
import { getProject } from "../services/project";
import { getContainerInfo } from "../docker/containers";
import { detectPort } from "../docker/port-detector";

export async function proxyRoute(c: Context): Promise<Response> {
  const projectId = c.req.param("projectId");
  const project = getProject(projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!project.containerId || project.containerStatus !== "running") {
    return c.text("Container not running", 503);
  }

  const info = await getContainerInfo(project.containerId);
  if (!info?.ip) {
    return c.text("Cannot resolve container IP", 503);
  }

  // Determine port
  let port = project.previewPort;
  if (!port) {
    port = await detectPort(project.containerId);
    if (!port) {
      return c.text("No port detected. Start a dev server or set port manually.", 503);
    }
  }

  // Build the target URL
  const basePath = `/preview/${projectId}`;
  const path = c.req.path.replace(basePath, "") || "/";
  const query = c.req.url.includes("?")
    ? "?" + c.req.url.split("?")[1]
    : "";
  const targetUrl = `http://${info.ip}:${port}${path}${query}`;

  try {
    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");
    headers.delete("accept-encoding");
    // Fix Referer so the container sees correct paths
    const referer = headers.get("referer");
    if (referer) {
      try {
        const refUrl = new URL(referer);
        refUrl.pathname = refUrl.pathname.replace(basePath, "");
        headers.set("referer", refUrl.toString());
      } catch {}
    }

    const resp = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body:
        c.req.method !== "GET" && c.req.method !== "HEAD"
          ? c.req.raw.body
          : undefined,
    });

    // Forward response with modified headers
    const respHeaders = new Headers(resp.headers);
    respHeaders.delete("transfer-encoding");
    respHeaders.delete("content-encoding");
    respHeaders.delete("content-length");
    respHeaders.delete("x-frame-options");
    respHeaders.delete("content-security-policy");

    const contentType = resp.headers.get("content-type") || "";

    // Rewrite HTML responses to fix absolute paths
    if (contentType.includes("text/html")) {
      let html = await resp.text();
      html = rewriteHtml(html, basePath);
      return new Response(html, {
        status: resp.status,
        headers: respHeaders,
      });
    }

    // Rewrite Turbopack runtime to use proxied chunk base path
    if (contentType.includes("javascript") && path.includes("turbopack")) {
      let js = await resp.text();
      js = js.replace(
        /const CHUNK_BASE_PATH\s*=\s*"\/_next\/"/,
        `const CHUNK_BASE_PATH="${basePath}/_next/"`
      );
      return new Response(js, {
        status: resp.status,
        headers: respHeaders,
      });
    }

    return new Response(resp.body, {
      status: resp.status,
      headers: respHeaders,
    });
  } catch (e: any) {
    return c.text(`Proxy error: ${e.message}`, 502);
  }
}

/**
 * Catch-all for /_next/* requests that bypass the /preview/{id}/ prefix.
 * Uses the Referer header to determine which project to proxy to.
 */
export async function nextCatchAllRoute(c: Context): Promise<Response> {
  const referer = c.req.header("referer");
  if (!referer) {
    return c.text("Missing referer", 400);
  }

  // Extract project ID from referer path like /preview/{id}/...
  const match = referer.match(/\/preview\/([^/]+)/);
  if (!match) {
    return c.text("Cannot determine project from referer", 400);
  }

  const projectId = match[1];
  const project = getProject(projectId);
  if (!project?.containerId || project.containerStatus !== "running") {
    return c.text("Container not running", 503);
  }

  const info = await getContainerInfo(project.containerId);
  if (!info?.ip) {
    return c.text("Cannot resolve container IP", 503);
  }

  let port = project.previewPort;
  if (!port) {
    port = await detectPort(project.containerId);
    if (!port) {
      return c.text("No port detected", 503);
    }
  }

  const path = c.req.path;
  const query = c.req.url.includes("?") ? "?" + c.req.url.split("?")[1] : "";
  const targetUrl = `http://${info.ip}:${port}${path}${query}`;

  try {
    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");
    headers.delete("accept-encoding");

    const resp = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body:
        c.req.method !== "GET" && c.req.method !== "HEAD"
          ? c.req.raw.body
          : undefined,
    });

    const respHeaders = new Headers(resp.headers);
    respHeaders.delete("transfer-encoding");
    respHeaders.delete("content-encoding");
    respHeaders.delete("content-length");

    return new Response(resp.body, {
      status: resp.status,
      headers: respHeaders,
    });
  } catch (e: any) {
    return c.text(`Proxy error: ${e.message}`, 502);
  }
}

function rewriteHtml(html: string, basePath: string): string {
  // Rewrite absolute paths in src and href attributes
  html = html.replace(/(src|href|action)=(["'])\//g, `$1=$2${basePath}/`);

  // Note: we do NOT rewrite "/_next/" broadly as it would corrupt RSC inline
  // data in <script> tags. Stray /_next requests are caught by the /_next/*
  // catch-all route which uses the Referer to proxy to the correct container.

  // Inject a script to patch location/history/fetch/XHR/WebSocket for proxied pages
  const patchScript = `<script>
(function(){
  var B="${basePath}";
  // Strip basePath from a path
  function strip(p){return p.startsWith(B)?p.slice(B.length)||"/":p}
  // Add basePath to a path
  function prefix(p){return(p.startsWith("/")&&!p.startsWith(B))?B+p:p}

  // Patch location getters so the app router sees clean paths
  var LP=Location.prototype;
  var pnGet=Object.getOwnPropertyDescriptor(LP,"pathname").get;
  Object.defineProperty(LP,"pathname",{get:function(){return strip(pnGet.call(this))}});
  var hrGet=Object.getOwnPropertyDescriptor(LP,"href").get;
  Object.defineProperty(LP,"href",{get:function(){
    var h=hrGet.call(this);try{var u=new URL(h);u.pathname=strip(u.pathname);return u.toString()}catch(e){return h}
  }});

  // Patch history to add basePath back when navigating
  var oPS=History.prototype.pushState;
  History.prototype.pushState=function(s,t,u){
    if(typeof u==="string")u=prefix(u);
    return oPS.call(this,s,t,u);
  };
  var oRS=History.prototype.replaceState;
  History.prototype.replaceState=function(s,t,u){
    if(typeof u==="string")u=prefix(u);
    return oRS.call(this,s,t,u);
  };

  // Patch fetch to add basePath
  var F=window.fetch;
  window.fetch=function(u,o){
    if(typeof u==="string")u=prefix(u);
    else if(u instanceof Request&&u.url){
      var p=new URL(u.url).pathname;
      if(p.startsWith("/")&&!p.startsWith(B)){u=new Request(B+p+new URL(u.url).search,u)}
    }
    return F.call(this,u,o);
  };
  // Patch XHR
  var X=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    if(typeof u==="string")u=prefix(u);
    return X.apply(this,[m,u,...[].slice.call(arguments,2)]);
  };
  // Patch EventSource
  var E=EventSource;
  window.EventSource=function(u,o){
    if(typeof u==="string")u=prefix(u);
    return new E(u,o);
  };
  window.EventSource.prototype=E.prototype;
  // Patch WebSocket
  var WS=window.WebSocket;
  window.WebSocket=function(u,p){
    if(typeof u==="string"){try{
      var obj=new URL(u,location.origin);
      if(obj.hostname===location.hostname)obj.pathname=prefix(obj.pathname);
      u=obj.toString();
    }catch(e){}}
    return p!==undefined?new WS(u,p):new WS(u);
  };
  window.WebSocket.prototype=WS.prototype;
  window.WebSocket.CONNECTING=WS.CONNECTING;
  window.WebSocket.OPEN=WS.OPEN;
  window.WebSocket.CLOSING=WS.CLOSING;
  window.WebSocket.CLOSED=WS.CLOSED;
})();
</script>`;

  // Inject patch script right after <head> or at the start of <body>
  if (html.includes("<head>")) {
    html = html.replace("<head>", "<head>" + patchScript);
  } else if (html.includes("<head")) {
    html = html.replace(/<head[^>]*>/, "$&" + patchScript);
  } else {
    html = patchScript + html;
  }

  return html;
}
