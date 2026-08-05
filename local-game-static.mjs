import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
]);

const securityHeaders = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

export function createLocalGameStatic(options = {}) {
  const root = path.resolve(options.root || ".");
  const manifestPath = path.resolve(options.manifestPath || path.join(root, "deploy/project-manifest.json"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const routes = (manifest.games || [])
    .filter(({ stack }) => stack === "vite-static")
    .map((game) => ({
      id: game.id,
      route: normalizeRoute(game.route),
      directory: resolveGameDirectory(root, game.source),
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
          ...securityHeaders,
          location: `${matched.route}${requestUrl.search}`,
          "cache-control": "no-store",
        });
        response.end();
        return true;
      }
      if (!["GET", "HEAD"].includes(request.method || "GET")) {
        response.writeHead(405, { ...securityHeaders, allow: "GET, HEAD", "cache-control": "no-store" });
        response.end();
        return true;
      }

      const encodedRelative = requestUrl.pathname.slice(matched.route.length);
      let relative;
      try {
        relative = decodeURIComponent(encodedRelative);
      } catch {
        sendNotFound(response);
        return true;
      }
      if (relative.includes("\\") || relative.includes("\0")) {
        sendNotFound(response);
        return true;
      }

      let filePath = resolveWithin(matched.directory, relative || "index.html");
      if (!filePath) {
        sendNotFound(response);
        return true;
      }
      let fileStat = await stat(filePath).catch(() => null);
      if (fileStat?.isDirectory()) {
        filePath = resolveWithin(matched.directory, path.join(relative, "index.html"));
        fileStat = filePath ? await stat(filePath).catch(() => null) : null;
      }
      if (!fileStat?.isFile() && !path.extname(relative)) {
        filePath = path.join(matched.directory, "index.html");
        fileStat = await stat(filePath).catch(() => null);
      }
      if (!fileStat?.isFile()) {
        sendNotFound(response);
        return true;
      }

      const extension = path.extname(filePath).toLowerCase();
      const isHtml = extension === ".html";
      const isFingerprinted = /-[A-Za-z0-9_-]{6,}\.[^.]+$/.test(path.basename(filePath));
      response.writeHead(200, {
        ...securityHeaders,
        "content-type": contentTypes.get(extension) || "application/octet-stream",
        "content-length": fileStat.size,
        "cache-control": isHtml
          ? "no-store"
          : isFingerprinted
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
      return true;
    },
  };
}

function normalizeRoute(value) {
  const route = String(value || "").trim();
  if (!/^\/[a-z0-9][a-z0-9/-]*\/$/.test(route)) throw new Error(`Invalid static game route: ${route}`);
  return route;
}

function resolveGameDirectory(root, source) {
  const value = String(source || "").trim();
  if (!/^games\/[a-z0-9][a-z0-9-]*$/.test(value)) throw new Error(`Invalid static game source: ${value}`);
  const directory = path.resolve(root, value, "dist");
  if (!resolveWithin(root, path.relative(root, directory))) throw new Error(`Static game source escapes root: ${value}`);
  return directory;
}

function resolveWithin(directory, relative) {
  const resolved = path.resolve(directory, relative);
  const fromRoot = path.relative(directory, resolved);
  return fromRoot && (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) ? null : resolved;
}

function sendNotFound(response) {
  response.writeHead(404, {
    ...securityHeaders,
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end("Not found");
}
