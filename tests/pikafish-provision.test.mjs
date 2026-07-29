import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  provisionPikafish,
  selectPikafishTarget,
} from "../scripts/provision-pikafish.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function fixtureRelease(url, digest) {
  return {
    version: 1,
    upstream: {
      project: "official-pikafish/Pikafish",
      homepage: "https://github.com/official-pikafish/Pikafish",
      license: "GPL-3.0",
      licenseUrl: "https://github.com/official-pikafish/Pikafish/blob/master/Copying.txt",
    },
    release: {
      tag: "Pikafish-test-release",
      pageUrl: "https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-test-release",
      asset: {
        name: "Pikafish.test.7z",
        url,
        sha256: digest,
      },
      targets: {
        "win32-x64": {
          executable: "Windows/pikafish-avx2.exe",
        },
      },
    },
  };
}

test("Pikafish provisions a pinned verified asset atomically and reuses its cache", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ai-hub-pikafish-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const archiveBytes = Buffer.from("fixture Pikafish archive v1");
  let requestCount = 0;
  const server = createServer((_request, response) => {
    requestCount += 1;
    response.writeHead(200, { "content-type": "application/x-7z-compressed" });
    response.end(archiveBytes);
  });
  const port = await listen(server);
  t.after(() => close(server));

  const releasePath = path.join(directory, "pikafish-release.json");
  await writeFile(
    releasePath,
    JSON.stringify(fixtureRelease(`http://127.0.0.1:${port}/Pikafish.test.7z`, sha256(archiveBytes))),
  );
  const runtimeDirectory = path.join(directory, "runtime", "engines");
  const staleDestination = path.join(
    runtimeDirectory,
    "pikafish",
    "Pikafish-test-release",
    "win32-x64",
  );
  await mkdir(staleDestination, { recursive: true });
  await writeFile(path.join(staleDestination, "stale.txt"), "stale");

  const extractArchive = async (_archivePath, extractionDirectory) => {
    const nested = path.join(extractionDirectory, "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, "pikafish-avx2.exe"), "verified executable");
    await writeFile(path.join(extractionDirectory, "pikafish.nnue"), "fixture network");
  };

  const created = await provisionPikafish({
    releasePath,
    runtimeDirectory,
    platform: "win32",
    arch: "x64",
    fetcher: fetch,
    extractArchive,
  });
  assert.equal(created.reused, false);
  assert.match(created.enginePath, /nested[\\/]pikafish-avx2\.exe$/);
  assert.equal(await readFile(created.enginePath, "utf8"), "verified executable");
  await assert.rejects(readFile(path.join(staleDestination, "stale.txt"), "utf8"));
  assert.equal(requestCount, 1);

  const reused = await provisionPikafish({
    releasePath,
    runtimeDirectory,
    platform: "win32",
    arch: "x64",
    fetcher: fetch,
    extractArchive: async () => {
      throw new Error("cache should skip extraction");
    },
  });
  assert.equal(reused.reused, true);
  assert.equal(reused.enginePath, created.enginePath);
  assert.equal(requestCount, 1);
});

test("Pikafish fails closed when downloaded bytes do not match SHA-256", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ai-hub-pikafish-bad-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = createServer((_request, response) => response.end("tampered bytes"));
  const port = await listen(server);
  t.after(() => close(server));
  const releasePath = path.join(directory, "pikafish-release.json");
  await writeFile(
    releasePath,
    JSON.stringify(fixtureRelease(`http://127.0.0.1:${port}/Pikafish.test.7z`, sha256("expected bytes"))),
  );

  await assert.rejects(
    provisionPikafish({
      releasePath,
      runtimeDirectory: path.join(directory, "runtime"),
      platform: "win32",
      arch: "x64",
      fetcher: fetch,
      extractArchive: async () => assert.fail("invalid archive must not be extracted"),
    }),
    /sha-?256|digest|hash/i,
  );
});

test("Pikafish target selection rejects unsupported platforms clearly", () => {
  const release = fixtureRelease("https://example.invalid/Pikafish.7z", "a".repeat(64));
  assert.deepEqual(selectPikafishTarget(release, "win32", "x64"), {
    key: "win32-x64",
    executable: "Windows/pikafish-avx2.exe",
  });
  assert.throws(() => selectPikafishTarget(release, "darwin", "x64"), /unsupported.*darwin.*x64/i);
});
