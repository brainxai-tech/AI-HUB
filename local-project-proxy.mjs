import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function createLocalProjectProxy(options = {}) {
  const manifestPath = path.resolve(options.manifestPath || "deploy/project-manifest.json");
  const sharedOrigin = normalizeLoopbackOrigin(options.sharedOrigin || "http://127.0.0.1:4195");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const routes = manifest.projects
    .map((project) => ({
      id: project.id,
      route: normalizeRoute(project.route),
      targetOrigin:
        project.api === "dedicated"
          ? normalizeLoopbackOrigin(`http://127.0.0.1:${Number(project.port)}`)
          : sharedOrigin,
    }))
    .sort((left, right) => right.route.length - left.route.length);

  return {
    routes,
    match(pathname) {
      return routes.find(({ route }) => pathname === route.slice(0, -1) || pathname.startsWith(route)) || null;
    },
    async handle(request, response, requestUrl) {
      const matched = this.match(requestUrl.pathname);
      if (!matched) return false;
      if (requestUrl.pathname === matched.route.slice(0, -1)) {
        response.writeHead(308, {
          location: `${matched.route}${requestUrl.search}`,
          "cache-control": "no-store",
        });
        response.end();
        return true;
      }
      await proxyRequest(request, response, new URL(`${requestUrl.pathname}${requestUrl.search}`, matched.targetOrigin));
      return true;
    },
  };
}

function normalizeRoute(value) {
  const route = String(value || "").trim();
  if (!/^\/[a-z0-9][a-z0-9/-]*\/$/.test(route)) {
    throw new Error(`Invalid local project route: ${route}`);
  }
  return route;
}

function normalizeLoopbackOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Local project target must be a loopback HTTP origin: ${value}`);
  }
  return url.origin;
}

function proxyRequest(request, response, target) {
  return new Promise((resolve, reject) => {
    const headers = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (!hopByHopHeaders.has(name.toLowerCase()) && name.toLowerCase() !== "host" && value !== undefined) {
        headers[name] = value;
      }
    }
    headers.host = target.host;
    headers["x-forwarded-host"] = request.headers.host || "127.0.0.1";
    headers["x-forwarded-proto"] = "http";

    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const upstream = send(target, { method: request.method, headers }, (upstreamResponse) => {
      const responseHeaders = {};
      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (!hopByHopHeaders.has(name.toLowerCase()) && value !== undefined) responseHeaders[name] = value;
      }
      const location = responseHeaders.location;
      if (typeof location === "string" && location.startsWith(target.origin)) {
        responseHeaders.location = location.slice(target.origin.length) || "/";
      }
      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(response);
      upstreamResponse.once("end", resolve);
      upstreamResponse.once("error", reject);
    });
    upstream.once("error", reject);
    request.once("aborted", () => upstream.destroy());
    request.pipe(upstream);
  }).catch((cause) => {
    if (!response.headersSent) {
      response.writeHead(502, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({ error: { code: "LOCAL_PROJECT_UNAVAILABLE", message: "Local project runtime is unavailable." } }));
      return;
    }
    response.destroy(cause);
  });
}
