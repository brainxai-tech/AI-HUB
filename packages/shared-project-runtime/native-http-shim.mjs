const capturesKey = Symbol.for("aihub.native-http-captures");
const currentProjectKey = Symbol.for("aihub.native-current-project");

export function createServer(listener) {
  if (typeof listener !== "function") {
    throw new TypeError("A native project request listener is required.");
  }

  const projectId = globalThis[currentProjectKey];
  if (!projectId) {
    throw new Error("Native HTTP capture was used outside a project import.");
  }

  const captures = globalThis[capturesKey] || new Map();
  captures.set(projectId, listener);
  globalThis[capturesKey] = captures;

  const server = {
    listen(...args) {
      const callback = args.findLast((value) => typeof value === "function");
      if (callback) queueMicrotask(callback);
      return server;
    },
    on() {
      return server;
    },
    once() {
      return server;
    },
    close(callback) {
      if (typeof callback === "function") queueMicrotask(callback);
      return server;
    },
  };
  return server;
}

export default { createServer };
