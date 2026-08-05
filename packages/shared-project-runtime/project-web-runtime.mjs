import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".txt", "text/plain; charset=utf-8"],
]);

export async function createProjectWebRuntime(options = {}) {
  const appsRoot = path.resolve(options.appsRoot);
  const manifest = JSON.parse(await readFile(path.resolve(options.manifestPath), "utf8"));
  const projects = [];

  for (const spec of manifest.projects.filter((project) => project.api === "shared")) {
    const projectRoot = path.resolve(appsRoot, path.basename(spec.source));
    const route = normalizeRoute(spec.route);
    if (spec.stack === "next") {
      const buildIdPath = path.join(projectRoot, ".next", "BUILD_ID");
      if (!existsSync(buildIdPath)) throw missingBuild(spec, ".next/BUILD_ID");
      const requireFromProject = createRequire(path.join(projectRoot, "package.json"));
      const imported = requireFromProject("next");
      const nextFactory = imported.default || imported;
      const app = await withNextBasePath(route, async () => {
        const nextApp = nextFactory({ dev: false, dir: projectRoot, quiet: true });
        await nextApp.prepare();
        return nextApp;
      });
      projects.push({ id: spec.id, route, kind: "next", app, handler: app.getRequestHandler() });
      continue;
    }

    const staticRoot = path.join(projectRoot, spec.stack === "node-static" ? "public" : "dist");
    if (!existsSync(path.join(staticRoot, "index.html"))) {
      throw missingBuild(spec, `${path.basename(staticRoot)}/index.html`);
    }
    projects.push({ id: spec.id, route, kind: "static", staticRoot });
  }

  projects.sort((left, right) => right.route.length - left.route.length);
  return {
    projectIds: projects.map(({ id }) => id),
    async handle(request, response, pathname) {
      const project = projects.find(({ route }) => pathname === route.slice(0, -1) || pathname.startsWith(route));
      if (!project) return false;
      if (pathname === project.route.slice(0, -1)) {
        response.writeHead(308, { location: project.route, "cache-control": "no-store" });
        response.end();
        return true;
      }
      if (project.kind === "next") {
        await project.handler(request, response);
        return true;
      }
      await serveStaticProject(request, response, pathname, project);
      return true;
    },
    async close() {
      await Promise.all(projects.filter(({ kind }) => kind === "next").map(({ app }) => app.close()));
    },
  };
}

function normalizeRoute(value) {
  const route = String(value || "").trim();
  if (!/^\/[a-z0-9][a-z0-9/-]*\/$/.test(route)) throw new Error(`Invalid project web route: ${route}`);
  return route;
}

export async function withNextBasePath(route, callback, environment = process.env) {
  const basePath = normalizeRoute(route).slice(0, -1);
  const keys = ["BASE_PATH", "NEXT_PUBLIC_BASE_PATH"];
  const previous = keys.map((key) => ({
    key,
    present: Object.hasOwn(environment, key),
    value: environment[key],
  }));
  for (const key of keys) environment[key] = basePath;
  try {
    return await callback(basePath);
  } finally {
    for (const { key, present, value } of previous) {
      if (present) environment[key] = value;
      else delete environment[key];
    }
  }
}

function missingBuild(spec, expected) {
  return new Error(`Missing web build for ${spec.id}: ${expected}. Run npm run workspace:build from the repository root.`);
}

async function serveStaticProject(request, response, pathname, project) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD", "cache-control": "no-store" });
    response.end();
    return;
  }

  const relative = decodeURIComponent(pathname.slice(project.route.length)).replace(/^\/+/, "");
  let filePath = safeStaticPath(project.staticRoot, relative || "index.html");
  let fileStat = await tryStat(filePath);
  if ((!fileStat || !fileStat.isFile()) && !path.extname(relative)) {
    filePath = path.join(project.staticRoot, "index.html");
    fileStat = await tryStat(filePath);
  }
  if (!filePath || !fileStat?.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
    "content-length": fileStat.size,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

function safeStaticPath(root, relative) {
  const candidate = path.resolve(root, relative);
  const withinRoot = path.relative(root, candidate);
  return withinRoot && !withinRoot.startsWith("..") && !path.isAbsolute(withinRoot) ? candidate : withinRoot === "" ? candidate : null;
}

async function tryStat(filePath) {
  if (!filePath) return null;
  try {
    return await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
