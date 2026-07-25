import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { blockTypesPackageVersion, cleanupScaffoldTempRoot, createBlockExternalFixturePath, createBlockSubsetFixturePath, createScaffoldTempRoot, normalizedBlockRuntimePackageVersion, packageRoot, templateLayerFixturePath, workspaceTemplatePackageManifest, wpTypiaPackageManifest } from "./helpers/scaffold-test-harness.js";
import { getTemplateVariables, scaffoldProject } from "../src/runtime/index.js";
import { resolveTemplateId } from "../src/runtime/scaffold.js";
import {
  EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV,
  EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV,
  findReusableExternalTemplateSourceCache,
  pruneExternalTemplateCache,
  resolveExternalTemplateSourceCache,
} from "../src/runtime/template-source-cache.js";
import { copyRenderedDirectory } from "../src/runtime/template-render.js";
import { parseGitHubTemplateLocator, parseNpmTemplateLocator, parseTemplateLocator, resolveTemplateSeed } from "../src/runtime/template-source.js";
import { EXTERNAL_TEMPLATE_TRUST_WARNING } from "../src/runtime/template-source-external.js";

describe("@wp-typia/project-tools template sources", () => {
  const tempRoot = createScaffoldTempRoot("wp-typia-template-source-");

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

  async function startStubServer(
    handler: (
      request: http.IncomingMessage,
      response: http.ServerResponse<http.IncomingMessage>
    ) => void
  ): Promise<{ close: () => Promise<void>; url: string }> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected an ephemeral stub server port.");
    }

    return {
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
      url: `http://127.0.0.1:${address.port}`,
    };
  }

  function restoreEnvValue(name: string, previousValue: string | undefined): void {
    if (previousValue === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previousValue;
    }
  }

  function createMinimalNpmTemplateTarball(
    fixtureRoot: string,
    packageName: string,
    version: string
  ): string {
    const packageDir = path.join(fixtureRoot, "package");
    const tarballPath = path.join(fixtureRoot, "template.tgz");

    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify(
        {
          name: packageName,
          version,
        },
        null,
        2
      ),
      "utf8"
    );
    fs.writeFileSync(
      path.join(packageDir, "block.json"),
      JSON.stringify({ name: "demo/cache-template", title: "Cache Template" }),
      "utf8"
    );
    execFileSync("tar", ["-czf", tarballPath, "-C", fixtureRoot, "package"]);

    return tarballPath;
  }

  function findFileByName(rootDir: string, fileName: string): string | null {
    if (!fs.existsSync(rootDir)) {
      return null;
    }

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
      const entryPath = path.join(rootDir, entry.name);
      if (entry.isFile() && entry.name === fileName) {
        return entryPath;
      }
      if (entry.isDirectory()) {
        const nestedFilePath = findFileByName(entryPath, fileName);
        if (nestedFilePath) {
          return nestedFilePath;
        }
      }
    }

    return null;
  }

  function setCacheMarkerCreatedAt(sourceDir: string, createdAt: Date): void {
    const markerPath = path.join(
      path.dirname(sourceDir),
      "wp-typia-template-cache.json"
    );
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as Record<
      string,
      unknown
    >;

    fs.writeFileSync(
      markerPath,
      `${JSON.stringify(
        {
          ...marker,
          createdAt: createdAt.toISOString(),
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  function ensurePrivateDirectory(directory: string): void {
    fs.mkdirSync(directory, { mode: 0o700, recursive: true });
    if (process.platform !== "win32") {
      fs.chmodSync(directory, 0o700);
    }
  }

test("external template cache rejects unsafe namespaces before populating", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  let populated = false;

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = path.join(
    tempRoot,
    "unsafe-namespace-cache"
  );
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;

  try {
    const resolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["unsafe"],
        metadata: {},
        namespace: "../escape",
      },
      async (sourceDir) => {
        populated = true;
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    expect(resolution).toBeNull();
    expect(populated).toBe(false);
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
  }
});

test("external template cache redacts malformed URL-like metadata", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  const cacheDir = path.join(tempRoot, "redacted-marker-cache");

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = cacheDir;
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;

  try {
    const resolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["redacted-marker"],
        metadata: {
          raw: "safe diagnostic",
          registry: "https://user:pass@example.test/registry?token=secret#hash",
          tarball: "not a valid url with secret-token",
        },
        namespace: "metadata",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    expect(resolution?.cacheHit).toBe(false);

    const markerPath = findFileByName(
      cacheDir,
      "wp-typia-template-cache.json"
    );
    if (!markerPath) {
      throw new Error("Expected a populated external template cache marker.");
    }

    const markerText = fs.readFileSync(markerPath, "utf8");
    expect(markerText).toContain("[redacted]");
    expect(markerText).not.toContain("secret-token");
    expect(markerText).not.toContain("user:pass");
    expect(markerText).not.toContain("token=secret");
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
  }
});

test("external template cache treats populate filesystem errors as misses", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = path.join(
    tempRoot,
    "populate-error-cache"
  );
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;

  try {
    const resolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["populate-error"],
        metadata: {},
        namespace: "npm",
      },
      async () => {
        const error = new Error("cache volume full") as Error & {
          code: string;
        };
        error.code = "ENOSPC";
        throw error;
      }
    );

    expect(resolution).toBeNull();
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
  }
});

test("external template cache keeps source populate failures visible", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = path.join(
    tempRoot,
    "populate-source-error-cache"
  );
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;

  try {
    await expect(
      resolveExternalTemplateSourceCache(
        {
          keyParts: ["populate-source-error"],
          metadata: {},
          namespace: "npm",
        },
        async () => {
          throw new Error("download failed");
        }
      )
    ).rejects.toThrow("download failed");
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
  }
});

test("external template cache ignores corrupted source files", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = path.join(
    tempRoot,
    "corrupted-source-cache"
  );
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;

  try {
    const firstResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["corrupted-source"],
        metadata: {},
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    expect(firstResolution?.cacheHit).toBe(false);
    if (!firstResolution) {
      throw new Error("Expected a populated external template cache entry.");
    }

    fs.rmSync(firstResolution.sourceDir, { force: true, recursive: true });
    fs.writeFileSync(firstResolution.sourceDir, "not a directory", "utf8");

    let populated = false;
    const secondResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["corrupted-source"],
        metadata: {},
        namespace: "npm",
      },
      async (sourceDir) => {
        populated = true;
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    expect(secondResolution).toBeNull();
    expect(populated).toBe(true);
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
  }
});

test("external template cache rejects symlinked roots without chmoding targets", async () => {
  if (process.platform === "win32") {
    return;
  }

  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  const targetDir = path.join(tempRoot, "symlink-cache-target");
  const symlinkDir = path.join(tempRoot, "symlink-cache-root");
  let populated = false;

  fs.mkdirSync(targetDir, { recursive: true });
  fs.chmodSync(targetDir, 0o755);
  fs.symlinkSync(targetDir, symlinkDir, "dir");
  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = symlinkDir;
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;

  try {
    const resolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["symlink-root"],
        metadata: {},
        namespace: "npm",
      },
      async (sourceDir) => {
        populated = true;
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    expect(resolution).toBeNull();
    expect(populated).toBe(false);
    expect(fs.statSync(targetDir).mode & 0o077).not.toBe(0);
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
  }
});

test("external template cache can find reusable entries by metadata", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = path.join(
    tempRoot,
    "metadata-lookup-cache"
  );
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;

  try {
    const resolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: [
          "github",
          "demo-owner",
          "demo-repo",
          "plugin",
          "main",
          "0123456789abcdef0123456789abcdef01234567",
        ],
        metadata: {
          owner: "demo-owner",
          ref: "main",
          repo: "demo-repo",
          revision: "0123456789abcdef0123456789abcdef01234567",
          sourcePath: "plugin",
        },
        namespace: "github",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    expect(resolution?.cacheHit).toBe(false);

    const lookupResolution = await findReusableExternalTemplateSourceCache({
      metadata: {
        owner: "demo-owner",
        ref: "main",
        repo: "demo-repo",
        sourcePath: "plugin",
      },
      namespace: "github",
    });

    expect(lookupResolution?.cacheHit).toBe(true);
    expect(lookupResolution?.sourceDir).toBe(resolution?.sourceDir);
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
  }
});

test("external template cache TTL prunes stale entries before reuse", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  const originalCacheTtl = process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];
  const cacheDir = path.join(tempRoot, "ttl-reuse-cache");
  const descriptor = {
    keyParts: ["ttl-reuse"],
    metadata: {
      package: "@demo/ttl-reuse",
      version: "1.0.0",
    },
    namespace: "npm",
  };
  let populateCount = 0;

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = cacheDir;
  process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV] = "7";
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;

  try {
    const firstResolution = await resolveExternalTemplateSourceCache(
      descriptor,
      async (sourceDir) => {
        populateCount += 1;
        fs.writeFileSync(
          path.join(sourceDir, "package.json"),
          JSON.stringify({ refreshed: false }),
          "utf8"
        );
      }
    );

    expect(firstResolution?.cacheHit).toBe(false);
    if (!firstResolution) {
      throw new Error("Expected a populated external template cache entry.");
    }

    setCacheMarkerCreatedAt(
      firstResolution.sourceDir,
      new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    );

    const secondResolution = await resolveExternalTemplateSourceCache(
      descriptor,
      async (sourceDir) => {
        populateCount += 1;
        fs.writeFileSync(
          path.join(sourceDir, "package.json"),
          JSON.stringify({ refreshed: true }),
          "utf8"
        );
      }
    );

    expect(secondResolution?.cacheHit).toBe(false);
    expect(secondResolution?.sourceDir).toBe(firstResolution.sourceDir);
    expect(populateCount).toBe(2);
    expect(
      fs.readFileSync(
        path.join(firstResolution.sourceDir, "package.json"),
        "utf8"
      )
    ).toContain('"refreshed":true');
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
    restoreEnvValue(EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV, originalCacheTtl);
  }
});

test("external template cache prune helper handles empty cache directories", async () => {
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  const originalCacheTtl = process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];
  const cacheDir = path.join(tempRoot, "ttl-empty-cache");

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = cacheDir;
  delete process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];
  ensurePrivateDirectory(cacheDir);

  try {
    const pruneResult = await pruneExternalTemplateCache({
      now: new Date("2026-01-10T00:00:00.000Z"),
      ttlDays: 7,
    });

    expect(pruneResult.cacheRoot).toBe(cacheDir);
    expect(pruneResult.prunedEntries).toBe(0);
    expect(pruneResult.scannedEntries).toBe(0);
    expect(pruneResult.skippedEntries).toBe(0);
    expect(pruneResult.ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
    restoreEnvValue(EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV, originalCacheTtl);
  }
});

test("external template cache prune helper deterministically prunes expired entries and preserves fresh entries", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  const originalCacheTtl = process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];
  const cacheDir = path.join(tempRoot, "ttl-deterministic-cache");
  const now = new Date("2026-01-10T00:00:00.000Z");

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = cacheDir;
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  delete process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];

  try {
    const expiredResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["ttl-deterministic", "expired"],
        metadata: { name: "expired" },
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );
    const freshResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["ttl-deterministic", "fresh"],
        metadata: { name: "fresh" },
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    if (!expiredResolution || !freshResolution) {
      throw new Error("Expected populated external template cache entries.");
    }

    setCacheMarkerCreatedAt(
      expiredResolution.sourceDir,
      new Date("2026-01-01T00:00:00.000Z")
    );
    setCacheMarkerCreatedAt(
      freshResolution.sourceDir,
      new Date("2026-01-09T00:00:00.000Z")
    );

    const pruneResult = await pruneExternalTemplateCache({
      now,
      ttlDays: 7,
    });

    expect(pruneResult.prunedEntries).toBe(1);
    expect(pruneResult.scannedEntries).toBe(2);
    expect(pruneResult.skippedEntries).toBe(0);
    expect(fs.existsSync(path.dirname(expiredResolution.sourceDir))).toBe(false);
    expect(fs.existsSync(path.dirname(freshResolution.sourceDir))).toBe(true);
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
    restoreEnvValue(EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV, originalCacheTtl);
  }
});

test("external template cache prune helper skips fresh last-pruned scans", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  const originalCacheInterval =
    process.env[EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV];
  const originalCacheTtl = process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];
  const cacheDir = path.join(tempRoot, "ttl-throttle-skip-cache");
  const nowMs = Date.now();

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = cacheDir;
  process.env[EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV] = "60000";
  process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV] = "7";
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;

  try {
    const staleResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["ttl-throttle-skip", "stale"],
        metadata: { name: "stale" },
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    if (!staleResolution) {
      throw new Error("Expected a populated external template cache entry.");
    }

    setCacheMarkerCreatedAt(
      staleResolution.sourceDir,
      new Date(nowMs - 10 * 24 * 60 * 60 * 1000)
    );

    const firstPruneResult = await pruneExternalTemplateCache({
      force: true,
      now: nowMs,
    });

    expect(firstPruneResult.skippedByThrottle).toBe(false);
    expect(firstPruneResult.prunedEntries).toBe(1);
    expect(fs.existsSync(path.dirname(staleResolution.sourceDir))).toBe(false);

    const nextStaleResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["ttl-throttle-skip", "next-stale"],
        metadata: { name: "next-stale" },
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    if (!nextStaleResolution) {
      throw new Error("Expected a populated external template cache entry.");
    }

    setCacheMarkerCreatedAt(
      nextStaleResolution.sourceDir,
      new Date(nowMs - 10 * 24 * 60 * 60 * 1000)
    );

    const skippedPruneResult = await pruneExternalTemplateCache({
      now: nowMs + 1000,
    });

    expect(skippedPruneResult.skippedByThrottle).toBe(true);
    expect(skippedPruneResult.prunedEntries).toBe(0);
    expect(skippedPruneResult.scannedEntries).toBe(0);
    expect(fs.existsSync(path.dirname(nextStaleResolution.sourceDir))).toBe(
      true
    );
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
    restoreEnvValue(
      EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV,
      originalCacheInterval
    );
    restoreEnvValue(EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV, originalCacheTtl);
  }
});

test("external template cache prune helper reruns after interval or settings changes", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  const originalCacheInterval =
    process.env[EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV];
  const originalCacheTtl = process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];
  const intervalCacheDir = path.join(tempRoot, "ttl-throttle-interval-cache");
  const settingsCacheDir = path.join(tempRoot, "ttl-throttle-settings-cache");
  const nowMs = Date.now();

  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  process.env[EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV] = "60000";
  process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV] = "7";

  try {
    process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = intervalCacheDir;
    ensurePrivateDirectory(intervalCacheDir);
    await pruneExternalTemplateCache({
      force: true,
      now: nowMs,
    });

    const intervalStaleResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["ttl-throttle-interval", "stale"],
        metadata: { name: "stale" },
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    if (!intervalStaleResolution) {
      throw new Error("Expected a populated external template cache entry.");
    }

    setCacheMarkerCreatedAt(
      intervalStaleResolution.sourceDir,
      new Date(nowMs - 10 * 24 * 60 * 60 * 1000)
    );

    const intervalPruneResult = await pruneExternalTemplateCache({
      now: nowMs + 60001,
    });

    expect(intervalPruneResult.skippedByThrottle).toBe(false);
    expect(intervalPruneResult.prunedEntries).toBe(1);
    expect(fs.existsSync(path.dirname(intervalStaleResolution.sourceDir))).toBe(
      false
    );

    process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = settingsCacheDir;
    ensurePrivateDirectory(settingsCacheDir);
    await pruneExternalTemplateCache({
      force: true,
      now: nowMs,
    });

    const settingsStaleResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["ttl-throttle-settings", "stale"],
        metadata: { name: "stale" },
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    if (!settingsStaleResolution) {
      throw new Error("Expected a populated external template cache entry.");
    }

    setCacheMarkerCreatedAt(
      settingsStaleResolution.sourceDir,
      new Date(nowMs - 4 * 24 * 60 * 60 * 1000)
    );

    const settingsPruneResult = await pruneExternalTemplateCache({
      now: nowMs + 1000,
      ttlDays: 3,
    });

    expect(settingsPruneResult.skippedByThrottle).toBe(false);
    expect(settingsPruneResult.prunedEntries).toBe(1);
    expect(fs.existsSync(path.dirname(settingsStaleResolution.sourceDir))).toBe(
      false
    );
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
    restoreEnvValue(
      EXTERNAL_TEMPLATE_CACHE_PRUNE_INTERVAL_MS_ENV,
      originalCacheInterval
    );
    restoreEnvValue(EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV, originalCacheTtl);
  }
});

test("external template cache pruning is disabled by default and for invalid TTLs", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  const originalCacheTtl = process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];
  const cacheDir = path.join(tempRoot, "ttl-disabled-cache");

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = cacheDir;
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  delete process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];

  try {
    const staleResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["ttl-disabled", "stale"],
        metadata: { name: "stale" },
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    if (!staleResolution) {
      throw new Error("Expected a populated external template cache entry.");
    }

    setCacheMarkerCreatedAt(
      staleResolution.sourceDir,
      new Date("2026-01-01T00:00:00.000Z")
    );

    const disabledCases = [
      {},
      { ttlDays: 0 },
      { ttlDays: -1 },
      { ttlDays: Number.NaN },
      {
        env: {
          WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR: cacheDir,
          [EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV]: "not-a-number",
        },
      },
    ];

    for (const options of disabledCases) {
      const pruneResult = await pruneExternalTemplateCache({
        now: new Date("2026-01-10T00:00:00.000Z"),
        ...options,
      });

      expect(pruneResult.ttlMs).toBeNull();
      expect(pruneResult.prunedEntries).toBe(0);
      expect(fs.existsSync(path.dirname(staleResolution.sourceDir))).toBe(true);
    }
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
    restoreEnvValue(EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV, originalCacheTtl);
  }
});

test("external template cache prune helper stays inside the configured cache root", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  const originalCacheTtl = process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];
  const cacheDir = path.join(tempRoot, "ttl-helper-cache");
  const outsideDir = path.join(tempRoot, "ttl-helper-outside-target");
  const outsideFile = path.join(outsideDir, "keep.txt");
  const now = new Date("2026-01-10T00:00:00.000Z");

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = cacheDir;
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  delete process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];
  fs.mkdirSync(outsideDir, { recursive: true });
  fs.writeFileSync(outsideFile, "keep", "utf8");

  try {
    const staleResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["ttl-helper", "stale"],
        metadata: { name: "stale" },
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );
    const freshResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["ttl-helper", "fresh"],
        metadata: { name: "fresh" },
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    if (!staleResolution || !freshResolution) {
      throw new Error("Expected populated external template cache entries.");
    }

    setCacheMarkerCreatedAt(
      staleResolution.sourceDir,
      new Date("2026-01-01T00:00:00.000Z")
    );
    setCacheMarkerCreatedAt(
      freshResolution.sourceDir,
      new Date("2026-01-09T00:00:00.000Z")
    );

    if (process.platform !== "win32") {
      fs.symlinkSync(
        outsideDir,
        path.join(
          path.dirname(path.dirname(staleResolution.sourceDir)),
          "f".repeat(64)
        ),
        "dir"
      );
    }

    const pruneResult = await pruneExternalTemplateCache({
      now,
      ttlDays: 7,
    });

    expect(pruneResult.prunedEntries).toBe(1);
    expect(fs.existsSync(path.dirname(staleResolution.sourceDir))).toBe(false);
    expect(fs.existsSync(path.dirname(freshResolution.sourceDir))).toBe(true);
    expect(fs.readFileSync(outsideFile, "utf8")).toBe("keep");
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
    restoreEnvValue(EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV, originalCacheTtl);
  }
});

test("external template cache prune helper respects provided env TTL lookup", async () => {
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  const originalCacheTtl = process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV];
  const cacheDir = path.join(tempRoot, "ttl-explicit-env-cache");

  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = cacheDir;
  process.env[EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV] = "1";
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;

  try {
    const staleResolution = await resolveExternalTemplateSourceCache(
      {
        keyParts: ["ttl-explicit-env", "stale"],
        metadata: { name: "stale" },
        namespace: "npm",
      },
      async (sourceDir) => {
        fs.writeFileSync(path.join(sourceDir, "package.json"), "{}", "utf8");
      }
    );

    if (!staleResolution) {
      throw new Error("Expected a populated external template cache entry.");
    }

    setCacheMarkerCreatedAt(
      staleResolution.sourceDir,
      new Date("2026-01-01T00:00:00.000Z")
    );

    const pruneResult = await pruneExternalTemplateCache({
      env: {
        WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR: cacheDir,
      },
      now: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(pruneResult.ttlMs).toBeNull();
    expect(pruneResult.prunedEntries).toBe(0);
    expect(fs.existsSync(path.dirname(staleResolution.sourceDir))).toBe(true);
  } finally {
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
    restoreEnvValue(EXTERNAL_TEMPLATE_CACHE_TTL_DAYS_ENV, originalCacheTtl);
  }
});

test("getTemplateVariables rejects slugs that normalize to an empty identifier", () => {
  expect(() =>
    getTemplateVariables("basic", {
      author: "Test Runner",
      description: "Invalid slug",
      namespace: "create-block",
      phpPrefix: "demo_slug",
      slug: "!!!",
      textDomain: "demo-slug",
      title: "Invalid Slug",
    })
  ).toThrow("Block slug: Use lowercase letters, numbers, and hyphens only");
});

test("local create-block subset paths scaffold into a pnpm-ready wp-typia project", async () => {
  const targetDir = path.join(tempRoot, "demo-remote");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: createBlockSubsetFixturePath,
    packageManager: "pnpm",
    noInstall: true,
    withTestPreset: true,
    withWpEnv: true,
    answers: {
      author: "Test Runner",
      description: "Demo remote block",
      namespace: "create-block",
      slug: "demo-remote",
      title: "Demo Remote",
    },
  });

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
  );
  const generatedTypes = fs.readFileSync(
    path.join(targetDir, "src", "types.ts"),
    "utf8"
  );
  const generatedIndex = fs.readFileSync(
    path.join(targetDir, "src", "index.js"),
    "utf8"
  );
  const readme = fs.readFileSync(path.join(targetDir, "README.md"), "utf8");
  const generatedBlockJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "src", "block.json"), "utf8")
  );

  expect(packageJson.packageManager).toBe("pnpm@8.3.1");
  expect(packageJson.devDependencies["@wp-typia/block-runtime"]).toBe(
    normalizedBlockRuntimePackageVersion
  );
  expect(packageJson.devDependencies["@wp-typia/block-types"]).toBe(
    blockTypesPackageVersion
  );
  expect(
    packageJson.devDependencies["@wp-typia/project-tools"]
  ).toBeUndefined();
  expect(packageJson.scripts.build).toBe(
    "pnpm run sync --check && wp-scripts build --experimental-modules"
  );
  expect(generatedTypes).toContain("export interface DemoRemoteAttributes");
  expect(generatedTypes).toContain('"content"?: string & tags.Default<"">');
  expect(generatedIndex).toContain('import metadata from "./block.json";');
  expect(generatedBlockJson.name).toBe("create-block/demo-remote");
  expect(generatedBlockJson.title).toBe("Demo Remote");
  expect(generatedBlockJson.editorStyle).toBeUndefined();
  expect(generatedBlockJson.supports.align).toEqual(["wide", "full"]);
  expect(fs.existsSync(path.join(targetDir, ".wp-env.json"))).toBe(false);
  expect(fs.existsSync(path.join(targetDir, ".wp-env.test.json"))).toBe(
    false
  );
  expect(readme).not.toContain("## Local WordPress");
  expect(readme).not.toContain("## Local Test Preset");
});

test("template-source-remote preserves existing package.json.mustache wp-typia pins when patching remote manifests", () => {
  const runtimeDir = path.join(packageRoot, "src", "runtime", "templates");
  const templateSourceRemote = fs.readFileSync(
    path.join(runtimeDir, "template-source-remote.ts"),
    "utf8"
  );

  expect(templateSourceRemote).toMatch(
    /packageJson\.devDependencies\s*=\s*{\s*'@wp-typia\/block-runtime': '\{\{blockRuntimePackageVersion\}\}',\s*'@wp-typia\/block-types': '\{\{blockTypesPackageVersion\}\}',\s*\.\.\.existingDevDependencies,/s
  );
  expect(templateSourceRemote).not.toMatch(
    /packageJson\.devDependencies\s*=\s*{\s*\.\.\.existingDevDependencies,\s*'@wp-typia\/block-runtime': '\{\{blockRuntimePackageVersion\}\}',\s*'@wp-typia\/block-types': '\{\{blockTypesPackageVersion\}\}',/s
  );
});

test("external layer packages are rejected as standalone template ids", async () => {
  await expect(
    scaffoldProject({
      projectDir: path.join(tempRoot, "demo-external-layer-standalone"),
      templateId: templateLayerFixturePath,
      packageManager: "npm",
      noInstall: true,
      answers: {
        author: "Test Runner",
        description: "Layer package misuse",
        namespace: "create-block",
        slug: "demo-external-layer-standalone",
        title: "Demo External Layer Standalone",
      },
    })
  ).rejects.toThrow(
    "External layers currently compose only through built-in scaffolds via the runtime API"
  );
});

test("local official external template configs scaffold with the default variant", async () => {
  const targetDir = path.join(tempRoot, "demo-external-default");

  const result = await scaffoldProject({
    projectDir: targetDir,
    templateId: createBlockExternalFixturePath,
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      description: "Demo external block",
      namespace: "create-block",
      slug: "demo-external-default",
      title: "Demo External Default",
    },
  });

  const generatedTypes = fs.readFileSync(
    path.join(targetDir, "src", "types.ts"),
    "utf8"
  );
  const generatedEdit = fs.readFileSync(
    path.join(targetDir, "src", "edit.js"),
    "utf8"
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
  );
  const generatedBlockJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "src", "block.json"), "utf8")
  );

  expect(result.selectedVariant).toBe("standard");
  expect(result.warnings ?? []).toContain(EXTERNAL_TEMPLATE_TRUST_WARNING);
  expect(
    fs.existsSync(path.join(targetDir, "assets", "remote-note.txt"))
  ).toBe(true);
  expect(fs.existsSync(path.join(targetDir, "src", "assets"))).toBe(false);
  expect(
    packageJson.devDependencies["@wp-typia/project-tools"]
  ).toBeUndefined();
  expect(
    packageJson.dependencies?.["@wp-typia/project-tools"]
  ).toBeUndefined();
  expect(generatedTypes).toContain(
    '"variantLabel"?: string & tags.Default<"standard">'
  );
  expect(generatedTypes).toContain(
    '"transformedLabel"?: string & tags.Default<"standard-transformed">'
  );
  expect(generatedEdit).toContain("template-standard");
  expect(generatedEdit).toContain("standard-transformed");
  expect(generatedBlockJson.editorStyle).toBeUndefined();
  expect(generatedBlockJson.supports.multiple).toBe(false);
});

test("external template config imports time out with a direct diagnostic", async () => {
  const fixtureDir = path.join(tempRoot, "create-block-external-timeout");
  const targetDir = path.join(tempRoot, "demo-external-timeout");
  fs.cpSync(createBlockExternalFixturePath, fixtureDir, { recursive: true });
  fs.rmSync(path.join(fixtureDir, "index.cjs"));
  fs.writeFileSync(
    path.join(fixtureDir, "index.mjs"),
    [
      "await new Promise((resolve) => setTimeout(resolve, 200));",
      "export default {",
      '  blockTemplatesPath: "block-templates",',
      '  assetsPath: "assets",',
      "};",
      "",
    ].join("\n"),
    "utf8"
  );

  const previousTimeout = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TIMEOUT_MS;
  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TIMEOUT_MS = "25";

  try {
    await expect(
      scaffoldProject({
        projectDir: targetDir,
        templateId: fixtureDir,
        packageManager: "npm",
        noInstall: true,
        answers: {
          author: "Test Runner",
          description: "Timed out external block",
          namespace: "create-block",
          slug: "demo-external-timeout",
          title: "Demo External Timeout",
        },
      })
    ).rejects.toThrow(/Timed out while loading external template config/);
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TIMEOUT_MS;
    } else {
      process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TIMEOUT_MS = previousTimeout;
    }
  }
});

test("npm template tarballs that exceed the configured size limit fail early", async () => {
  let serverUrl = "";
  const server = await startStubServer((request, response) => {
    if ((request.url ?? "") === "/%40scope%2Ftemplate") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(
        JSON.stringify({
          "dist-tags": {
            latest: "1.0.0",
          },
          versions: {
            "1.0.0": {
              dist: {
                tarball: `${serverUrl}/template.tgz`,
              },
            },
          },
        })
      );
      return;
    }

    if ((request.url ?? "") === "/template.tgz") {
      const payload = Buffer.alloc(128, 65);
      response.writeHead(200, {
        "content-length": String(payload.length),
        "content-type": "application/octet-stream",
      });
      response.end(payload);
      return;
    }

    response.writeHead(404);
    response.end("not found");
  });
  serverUrl = server.url;

  const previousRegistry = process.env.NPM_CONFIG_REGISTRY;
  const previousTarballLimit =
    process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TARBALL_MAX_BYTES;
  process.env.NPM_CONFIG_REGISTRY = server.url;
  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TARBALL_MAX_BYTES = "64";

  try {
    await expect(
      resolveTemplateSeed(parseTemplateLocator("@scope/template"), tempRoot)
    ).rejects.toThrow(/external template size limit/);
  } finally {
    if (previousRegistry === undefined) {
      delete process.env.NPM_CONFIG_REGISTRY;
    } else {
      process.env.NPM_CONFIG_REGISTRY = previousRegistry;
    }
    if (previousTarballLimit === undefined) {
      delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TARBALL_MAX_BYTES;
    } else {
      process.env.WP_TYPIA_EXTERNAL_TEMPLATE_TARBALL_MAX_BYTES =
        previousTarballLimit;
    }
    await server.close();
  }
});

test("npm template tarballs reuse the external template cache until integrity changes", async () => {
  const packageName = "@demo/cache-template";
  const version = "1.0.0";
  const npmTemplateRoot = fs.mkdtempSync(
    path.join(tempRoot, "npm-cache-template-")
  );
  const registryBase = "https://token:secret@registry.npmjs.org";
  const metadataUrl = `${registryBase}/${encodeURIComponent(packageName)}`;
  const getTarballUrl = (): string =>
    `${registryBase}/@demo/cache-template/-/cache-template-1.0.0.tgz?download-token=${tarballToken}#debug`;
  const tarballPath = createMinimalNpmTemplateTarball(
    npmTemplateRoot,
    packageName,
    version
  );
  const originalFetch = globalThis.fetch;
  const originalRegistry = process.env.NPM_CONFIG_REGISTRY;
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  let integrity = "sha512-cache-one";
  let shasum = "cache-one";
  let tarballToken = "cache-one";
  let tarballDownloads = 0;

  process.env.NPM_CONFIG_REGISTRY = registryBase;
  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = path.join(
    npmTemplateRoot,
    "cache"
  );
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  globalThis.fetch = (async (input) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    if (requestUrl === metadataUrl) {
      return new Response(
        JSON.stringify({
          "dist-tags": {
            latest: version,
          },
          versions: {
            [version]: {
              dist: {
                integrity,
                shasum,
                tarball: getTarballUrl(),
              },
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    }

    if (requestUrl === getTarballUrl()) {
      tarballDownloads += 1;
      return new Response(fs.readFileSync(tarballPath), { status: 200 });
    }

    throw new Error(
      `Unexpected fetch URL in npm template cache test: ${requestUrl}`
    );
  }) as typeof fetch;

  try {
    const locator = parseTemplateLocator("@demo/cache-template@^1.0.0");
    const first = await resolveTemplateSeed(locator, tempRoot);
    tarballToken = "cache-two";
    const second = await resolveTemplateSeed(locator, tempRoot);

    expect(tarballDownloads).toBe(1);
    expect(second.rootDir).toBe(first.rootDir);
    expect(fs.existsSync(path.join(second.rootDir, "package.json"))).toBe(
      true
    );

    const cacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
    if (!cacheDir) {
      throw new Error("Expected the template cache directory to be configured.");
    }
    const markerPath = findFileByName(
      cacheDir,
      "wp-typia-template-cache.json"
    );
    if (!markerPath) {
      throw new Error("Expected a populated external template cache marker.");
    }
    const markerText = fs.readFileSync(markerPath, "utf8");
    expect(markerText).not.toContain("keyParts");
    expect(markerText).not.toContain("token:secret");
    expect(markerText).not.toContain("download-token");

    integrity = "sha512-cache-two";
    shasum = "cache-two";
    tarballToken = "cache-three";

    const third = await resolveTemplateSeed(locator, tempRoot);
    expect(tarballDownloads).toBe(2);
    expect(third.rootDir).not.toBe(first.rootDir);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvValue("NPM_CONFIG_REGISTRY", originalRegistry);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
  }
});

test("npm template cache can be bypassed with an environment override", async () => {
  const packageName = "@demo/cache-bypass-template";
  const version = "1.0.0";
  const npmTemplateRoot = fs.mkdtempSync(
    path.join(tempRoot, "npm-cache-bypass-template-")
  );
  const registryBase = "https://registry.npmjs.org";
  const metadataUrl = `${registryBase}/${encodeURIComponent(packageName)}`;
  const tarballUrl = `${registryBase}/@demo/cache-bypass-template/-/cache-bypass-template-1.0.0.tgz`;
  const tarballPath = createMinimalNpmTemplateTarball(
    npmTemplateRoot,
    packageName,
    version
  );
  const originalFetch = globalThis.fetch;
  const originalRegistry = process.env.NPM_CONFIG_REGISTRY;
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  let tarballDownloads = 0;

  process.env.NPM_CONFIG_REGISTRY = registryBase;
  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE = "0";
  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = path.join(
    npmTemplateRoot,
    "cache"
  );
  globalThis.fetch = (async (input) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    if (requestUrl === metadataUrl) {
      return new Response(
        JSON.stringify({
          "dist-tags": {
            latest: version,
          },
          versions: {
            [version]: {
              dist: {
                integrity: "sha512-cache-bypass",
                shasum: "cache-bypass",
                tarball: tarballUrl,
              },
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    }

    if (requestUrl === tarballUrl) {
      tarballDownloads += 1;
      return new Response(fs.readFileSync(tarballPath), { status: 200 });
    }

    throw new Error(
      `Unexpected fetch URL in npm template cache bypass test: ${requestUrl}`
    );
  }) as typeof fetch;

  try {
    const locator = parseTemplateLocator("@demo/cache-bypass-template@^1.0.0");
    const first = await resolveTemplateSeed(locator, tempRoot);
    const second = await resolveTemplateSeed(locator, tempRoot);

    expect(tarballDownloads).toBe(2);
    expect(second.rootDir).not.toBe(first.rootDir);

    await first.cleanup?.();
    await second.cleanup?.();
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvValue("NPM_CONFIG_REGISTRY", originalRegistry);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
  }
});

test("npm template cache falls back when the cache directory is unavailable", async () => {
  const packageName = "@demo/cache-unavailable-template";
  const version = "1.0.0";
  const npmTemplateRoot = fs.mkdtempSync(
    path.join(tempRoot, "npm-cache-unavailable-template-")
  );
  const registryBase = "https://registry.npmjs.org";
  const metadataUrl = `${registryBase}/${encodeURIComponent(packageName)}`;
  const tarballUrl = `${registryBase}/@demo/cache-unavailable-template/-/cache-unavailable-template-1.0.0.tgz`;
  const tarballPath = createMinimalNpmTemplateTarball(
    npmTemplateRoot,
    packageName,
    version
  );
  const unavailableCachePath = path.join(npmTemplateRoot, "cache-file");
  const originalFetch = globalThis.fetch;
  const originalRegistry = process.env.NPM_CONFIG_REGISTRY;
  const originalCache = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  const originalCacheDir = process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR;
  let tarballDownloads = 0;

  fs.writeFileSync(unavailableCachePath, "not a directory", "utf8");
  process.env.NPM_CONFIG_REGISTRY = registryBase;
  process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR = unavailableCachePath;
  delete process.env.WP_TYPIA_EXTERNAL_TEMPLATE_CACHE;
  globalThis.fetch = (async (input) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    if (requestUrl === metadataUrl) {
      return new Response(
        JSON.stringify({
          "dist-tags": {
            latest: version,
          },
          versions: {
            [version]: {
              dist: {
                integrity: "sha512-cache-unavailable",
                shasum: "cache-unavailable",
                tarball: tarballUrl,
              },
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    }

    if (requestUrl === tarballUrl) {
      tarballDownloads += 1;
      return new Response(fs.readFileSync(tarballPath), { status: 200 });
    }

    throw new Error(
      `Unexpected fetch URL in npm template unavailable cache test: ${requestUrl}`
    );
  }) as typeof fetch;

  try {
    const locator = parseTemplateLocator(
      "@demo/cache-unavailable-template@^1.0.0"
    );
    const first = await resolveTemplateSeed(locator, tempRoot);
    const second = await resolveTemplateSeed(locator, tempRoot);

    expect(tarballDownloads).toBe(2);
    expect(second.rootDir).not.toBe(first.rootDir);

    await first.cleanup?.();
    await second.cleanup?.();
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvValue("NPM_CONFIG_REGISTRY", originalRegistry);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE", originalCache);
    restoreEnvValue("WP_TYPIA_EXTERNAL_TEMPLATE_CACHE_DIR", originalCacheDir);
  }
});

test("local official external template configs honor --variant overrides", async () => {
  const targetDir = path.join(tempRoot, "demo-external-hero");

  const result = await scaffoldProject({
    projectDir: targetDir,
    templateId: createBlockExternalFixturePath,
    variant: "hero",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      description: "Demo external variant block",
      namespace: "create-block",
      slug: "demo-external-hero",
      title: "Demo External Hero",
    },
  });

  const generatedTypes = fs.readFileSync(
    path.join(targetDir, "src", "types.ts"),
    "utf8"
  );
  const generatedEdit = fs.readFileSync(
    path.join(targetDir, "src", "edit.js"),
    "utf8"
  );
  const generatedBlockJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "src", "block.json"), "utf8")
  );

  expect(result.selectedVariant).toBe("hero");
  expect(fs.existsSync(path.join(targetDir, "src", "assets"))).toBe(false);
  expect(generatedTypes).toContain(
    '"variantLabel"?: string & tags.Default<"hero">'
  );
  expect(generatedTypes).toContain(
    '"transformedLabel"?: string & tags.Default<"hero-transformed">'
  );
  expect(generatedEdit).toContain("template-hero");
  expect(generatedBlockJson.supports.multiple).toBe(true);
});

test("external template configs still honor variants when the package root declares a workspace project type", async () => {
  const fixtureDir = path.join(tempRoot, "create-block-external-workspace-root");
  const targetDir = path.join(tempRoot, "demo-external-workspace-root");
  fs.cpSync(createBlockExternalFixturePath, fixtureDir, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureDir, "package.json"),
    JSON.stringify(
      {
        name: "@scope/external-template-config",
        version: "0.0.0",
        wpTypia: {
          projectType: "workspace",
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const result = await scaffoldProject({
    projectDir: targetDir,
    templateId: fixtureDir,
    variant: "workspace",
    packageManager: "npm",
    noInstall: true,
    withMigrationUi: true,
    answers: {
      author: "Test Runner",
      description: "Demo external workspace root",
      namespace: "demo-space",
      phpPrefix: "demo_space",
      slug: "demo-external-workspace-root",
      textDomain: "demo-space",
      title: "Demo External Workspace Root",
    },
  });

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
  );

  expect(result.selectedVariant).toBe("workspace");
  expect(packageJson.wpTypia?.templatePackage).toBe(
    "@scope/external-workspace-template"
  );
  expect(packageJson.scripts["migration:doctor"]).toContain("wp-typia");
});

test("plugin template variants do not require wpTypia.projectType to resolve as full wp-typia templates", async () => {
  const fixtureDir = path.join(tempRoot, "create-block-external-plugin-root");
  const targetDir = path.join(tempRoot, "demo-external-plugin-root");
  fs.cpSync(createBlockExternalFixturePath, fixtureDir, { recursive: true });

  const pluginPackageJsonPath = path.join(
    fixtureDir,
    "plugin-templates",
    "package.json.mustache"
  );
  const pluginPackageJson = JSON.parse(
    fs.readFileSync(pluginPackageJsonPath, "utf8")
  );
  delete pluginPackageJson.wpTypia;
  fs.writeFileSync(
    pluginPackageJsonPath,
    `${JSON.stringify(pluginPackageJson, null, 2)}\n`,
    "utf8"
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: fixtureDir,
    variant: "workspace",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      description: "Demo external plugin root",
      namespace: "demo-space",
      phpPrefix: "demo_space",
      slug: "demo-external-plugin-root",
      textDomain: "demo-space",
      title: "Demo External Plugin Root",
    },
  });

  expect(
    fs.existsSync(path.join(targetDir, "scripts", "build-workspace.mjs"))
  ).toBe(true);
  expect(
    fs.existsSync(path.join(targetDir, "src", "editor-plugins", "index.tsx"))
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        "src",
        "rest",
        "resources",
        "external-feed",
        "contract.ts"
      )
    )
  ).toBe(true);
});

test("external template workspace variants scaffold richer wp-typia workspaces with migration UI", async () => {
  const targetDir = path.join(tempRoot, "demo-external-workspace");

  const result = await scaffoldProject({
    projectDir: targetDir,
    templateId: createBlockExternalFixturePath,
    variant: "workspace",
    packageManager: "npm",
    noInstall: true,
    withMigrationUi: true,
    answers: {
      author: "Test Runner",
      description: "Demo external workspace",
      namespace: "demo-space",
      phpPrefix: "demo_space",
      slug: "demo-external-workspace",
      textDomain: "demo-space",
      title: "Demo External Workspace",
    },
  });

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
  );
  const readme = fs.readFileSync(path.join(targetDir, "README.md"), "utf8");

  expect(result.selectedVariant).toBe("workspace");
  expect(result.warnings ?? []).toContain(EXTERNAL_TEMPLATE_TRUST_WARNING);
  expect(packageJson.wpTypia).toEqual({
    projectType: "workspace",
    templatePackage: "@scope/external-workspace-template",
    namespace: "demo-space",
    textDomain: "demo-space",
    phpPrefix: "demo_space",
  });
  expect(packageJson.packageManager).toBeUndefined();
  expect(packageJson.scripts["migration:doctor"]).toContain("wp-typia");
  expect(
    fs.existsSync(path.join(targetDir, "assets", "remote-note.txt"))
  ).toBe(true);
  expect(
    fs.existsSync(path.join(targetDir, "src", "editor-plugins", "index.tsx"))
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(
        targetDir,
        "src",
        "rest",
        "resources",
        "external-feed",
        "contract.ts"
      )
    )
  ).toBe(true);
  expect(
    fs.existsSync(path.join(targetDir, "src", "support", "query-service.ts"))
  ).toBe(true);
  expect(
    fs.existsSync(path.join(targetDir, "scripts", "build-workspace.mjs"))
  ).toBe(true);
  expect(
    fs.existsSync(path.join(targetDir, "demo-external-workspace.php"))
  ).toBe(true);
  expect(readme).toContain("richer external `wp-typia` workspace shell");
});

test("external template scaffolds honor explicit repository reference overrides", async () => {
  const fixtureDir = path.join(tempRoot, "create-block-external-fork-reference");
  const targetDir = path.join(tempRoot, "demo-external-fork-reference");
  fs.cpSync(createBlockExternalFixturePath, fixtureDir, { recursive: true });
  fs.appendFileSync(
    path.join(fixtureDir, "block-templates", "edit.js.mustache"),
    "\n// Docs: https://github.com/yourusername/wp-typia-boilerplate/issues\n// CLI package: yourusername/wp-typia\n",
    "utf8"
  );

  await scaffoldProject({
    projectDir: targetDir,
    templateId: fixtureDir,
    packageManager: "npm",
    noInstall: true,
    repositoryReference: "fork-owner/fork-typia",
    answers: {
      author: "Test Runner",
      description: "Demo external fork reference block",
      namespace: "create-block",
      slug: "demo-external-fork-reference",
      title: "Demo External Fork Reference",
    },
  });

  const generatedEdit = fs.readFileSync(
    path.join(targetDir, "src", "edit.js"),
    "utf8"
  );

  expect(generatedEdit).toContain(
    "https://github.com/fork-owner/fork-typia/issues"
  );
  expect(generatedEdit).toContain("CLI package: fork-owner/fork-typia");
  expect(generatedEdit).not.toContain("yourusername/wp-typia");
});

test("malformed remote package metadata surfaces a direct parse diagnostic", async () => {
  const fixtureDir = path.join(tempRoot, "create-block-subset-invalid-package-json");
  fs.cpSync(createBlockSubsetFixturePath, fixtureDir, { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, "package.json"), "{\n", "utf8");

  await expect(
    scaffoldProject({
      projectDir: path.join(tempRoot, "demo-invalid-remote-package-json"),
      templateId: fixtureDir,
      packageManager: "npm",
      noInstall: true,
      answers: {
        author: "Test Runner",
        description: "Invalid remote package metadata",
        namespace: "create-block",
        slug: "demo-invalid-remote-package-json",
        title: "Invalid Remote Package Json",
      },
    })
  ).rejects.toThrow(
    /Failed to parse template metadata file ".*package\.json":/
  );
});

test("malformed remote projectType metadata surfaces a direct validation diagnostic", async () => {
  const fixtureDir = path.join(tempRoot, "create-block-subset-invalid-project-type");
  fs.cpSync(createBlockSubsetFixturePath, fixtureDir, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureDir, "package.json"),
    JSON.stringify(
      {
        name: "@scope/remote-template",
        version: "0.0.0",
        wpTypia: {
          projectType: 42,
        },
      },
      null,
      2
    ),
    "utf8"
  );

  await expect(
    scaffoldProject({
      projectDir: path.join(tempRoot, "demo-invalid-remote-project-type"),
      templateId: fixtureDir,
      packageManager: "npm",
      noInstall: true,
      answers: {
        author: "Test Runner",
        description: "Invalid remote project type",
        namespace: "create-block",
        slug: "demo-invalid-remote-project-type",
        title: "Invalid Remote Project Type",
      },
    })
  ).rejects.toThrow(
    /defines wpTypia\.projectType, but it must be a non-empty string\./
  );
});

test("workspace template package identity is defined once and imported by runtime callers", () => {
  const runtimeDir = path.join(packageRoot, "src", "runtime", "templates");
  const templateRegistry = fs.readFileSync(
    path.join(runtimeDir, "template-registry.ts"),
    "utf8"
  );
  const templateSource = fs.readFileSync(
    path.join(runtimeDir, "template-source.ts"),
    "utf8"
  );
  const cliScaffold = fs.readFileSync(
    path.join(runtimeDir, "cli-scaffold.ts"),
    "utf8"
  );
  const scaffoldRuntime = fs.readFileSync(
    path.join(runtimeDir, "scaffold.ts"),
    "utf8"
  );

  expect(templateRegistry).toContain(
    'export const OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE = "@wp-typia/create-workspace-template";'
  );
  expect(templateSource).toContain("OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE");
  expect(cliScaffold).toContain("OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE");
  expect(scaffoldRuntime).toContain("normalizeTemplateLookupId");
  expect(templateSource).not.toContain(
    'const OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE = "@wp-typia/create-workspace-template";'
  );
  expect(cliScaffold).not.toContain(
    'const OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE = "@wp-typia/create-workspace-template";'
  );
  expect(scaffoldRuntime).not.toContain(
    'const OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE = "@wp-typia/create-workspace-template";'
  );
});

test("template-source stays as a facade over dedicated locator, seed, and normalization helpers", () => {
  const runtimeDir = path.join(packageRoot, "src", "runtime", "templates");
  const templateSource = fs.readFileSync(
    path.join(runtimeDir, "template-source.ts"),
    "utf8"
  );

  expect(templateSource).toContain("./template-source-locators.js");
  expect(templateSource).toContain("./template-source-seeds.js");
  expect(templateSource).toContain("./template-source-normalization.js");
});

test("template-source-normalization stays as a facade over external and remote helper modules", () => {
  const runtimeDir = path.join(packageRoot, "src", "runtime", "templates");
  const templateSourceNormalization = fs.readFileSync(
    path.join(runtimeDir, "template-source-normalization.ts"),
    "utf8"
  );
  const templateSourceExternal = fs.readFileSync(
    path.join(runtimeDir, "template-source-external.ts"),
    "utf8"
  );
  const templateSourceRemote = fs.readFileSync(
    path.join(runtimeDir, "template-source-remote.ts"),
    "utf8"
  );

  expect(templateSourceNormalization).toContain("./template-source-external.js");
  expect(templateSourceNormalization).toContain("./template-source-remote.js");
  expect(templateSourceNormalization).not.toContain(
    "async function loadExternalTemplateConfig"
  );
  expect(templateSourceNormalization).not.toContain(
    "export async function renderCreateBlockExternalTemplate"
  );
  expect(templateSourceNormalization).not.toContain(
    "export async function normalizeCreateBlockSubset"
  );
  expect(templateSourceExternal).toContain(
    "export async function renderCreateBlockExternalTemplate"
  );
  expect(templateSourceRemote).toContain(
    "export async function normalizeCreateBlockSubset"
  );
});

test("template source copy filters use async filesystem probes", () => {
  const runtimeDir = path.join(packageRoot, "src", "runtime", "templates");
  const templateSourceExternal = fs.readFileSync(
    path.join(runtimeDir, "template-source-external.ts"),
    "utf8"
  );
  const templateSourceRemote = fs.readFileSync(
    path.join(runtimeDir, "template-source-remote.ts"),
    "utf8"
  );

  for (const source of [templateSourceExternal, templateSourceRemote]) {
    expect(source).toContain("await pathExists(mustacheVariantPath)");
    expect(source).not.toContain("fs.existsSync(mustacheVariantPath)");
  }
});

test("official workspace template scaffolds through the local npm template resolver", async () => {
  const targetDir = path.join(tempRoot, "demo-workspace-template");

  const result = await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      description: "Demo empty workspace",
      namespace: "demo-space",
      phpPrefix: "demo_space",
      slug: "demo-workspace-template",
      textDomain: "demo-space",
      title: "Demo Workspace Template",
    },
  });

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
  );
  const bootstrapSource = fs.readFileSync(
    path.join(targetDir, "demo-workspace-template.php"),
    "utf8"
  );
  const buildWorkspaceSource = fs.readFileSync(
    path.join(targetDir, "scripts", "build-workspace.mjs"),
    "utf8"
  );
  const readmeSource = fs.readFileSync(
    path.join(targetDir, "README.md"),
    "utf8"
  );
  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, "scripts", "block-config.ts"),
    "utf8"
  );
  const restSchemaHelperSource = fs.readFileSync(
    path.join(targetDir, "inc", "rest-schema.php"),
    "utf8"
  );

  expect(result.templateId).toBe(workspaceTemplatePackageManifest.name);
  expect(packageJson.wpTypia).toEqual({
    projectType: "workspace",
    templatePackage: workspaceTemplatePackageManifest.name,
    namespace: "demo-space",
    textDomain: "demo-space",
    phpPrefix: "demo_space",
  });
  expect(blockConfigSource).toContain("// wp-typia add block entries");
  expect(blockConfigSource).toContain("// wp-typia add variation entries");
  expect(blockConfigSource).toContain("// wp-typia add pattern entries");
  expect(blockConfigSource).toContain(
    "// wp-typia add binding-source entries"
  );
  expect(blockConfigSource).toContain("// wp-typia add contract entries");
  expect(blockConfigSource).toContain("// wp-typia add post-meta entries");
  expect(blockConfigSource).toContain("REST_SCHEMA_PACKAGE");
  expect(blockConfigSource).toContain("outputDir: 'inc/rest-schemas'");
  expect(packageJson.scripts.sync).toBe("ttsx scripts/sync-project.ts");
  expect(packageJson.scripts["sync-rest:package"]).toBe(
    "ttsx scripts/sync-rest-contracts.ts --package"
  );
  expect(packageJson.scripts["sync-rest:package:check"]).toBe(
    "ttsx scripts/sync-rest-contracts.ts --package --check"
  );
  expect(packageJson.scripts["wp-typia:sync"]).toBe("wp-typia sync");
  expect(packageJson.scripts["wp-typia:doctor"]).toBe("wp-typia doctor");
  expect(packageJson.scripts["wp-typia:doctor:workspace"]).toBe(
    "wp-typia doctor --workspace-only"
  );
  expect(packageJson.scripts["wp-typia:add"]).toBe("wp-typia add");
  expect(packageJson.scripts.build).toBe(
    "npm run sync -- --check && node scripts/build-workspace.mjs build"
  );
  expect(packageJson.scripts.start).toBe(
    "npm run sync && node scripts/build-workspace.mjs start"
  );
  expect(packageJson.scripts.dev).toBe("npm run start");
  expect(packageJson.packageManager).toBeUndefined();
  expect(packageJson.scripts.typecheck).toBe(
    "npm run sync -- --check && ttsc --noEmit"
  );
  expect(packageJson.devDependencies["wp-typia"]).toBe(
    `^${wpTypiaPackageManifest.version}`
  );
  expect(packageJson.dependencies["@wordpress/data"]).toBe("~10.46.0");
  expect(readmeSource).toContain("npm run wp-typia:doctor");
  expect(readmeSource).toContain("npm run wp-typia:sync -- --check");
  expect(readmeSource).toContain("npm run sync-rest:package:check");
  expect(readmeSource).toContain("demo_space_get_wordpress_rest_schema");
  expect(readmeSource).toContain(
    "npm run wp-typia:add -- block counter-card --template basic"
  );
  expect(buildWorkspaceSource).toContain("--blocks-manifest");
  expect(buildWorkspaceSource).toContain("if ( blockSlugs.length === 0 )");
  expect(bootstrapSource).toContain("wp_register_block_metadata_collection");
  expect(bootstrapSource).toContain(
    "wp_register_block_types_from_metadata_collection"
  );
  expect(bootstrapSource).toContain("src/bindings/*/server.php");
  expect(bootstrapSource).toContain("function demo_space_load_rest_schema_helpers()");
  expect(bootstrapSource).toContain("inc/rest-schema.php");
  expect(bootstrapSource).toContain("enqueue_block_editor_assets");
  expect(bootstrapSource).toContain("register_block_pattern_category");
  expect(bootstrapSource).toContain("/src/patterns/*.php");
  expect(restSchemaHelperSource).toContain("function demo_space_load_rest_schema");
  expect(restSchemaHelperSource).toContain(
    "function demo_space_prepare_rest_schema_for_wordpress"
  );
  expect(restSchemaHelperSource).toContain(
    "function demo_space_get_wordpress_rest_schema"
  );
  expect(restSchemaHelperSource).toContain(
    "function demo_space_validate_and_sanitize_rest_payload"
  );
  expect(restSchemaHelperSource).toContain("malformed_rest_schema");
  expect(
    fs.existsSync(path.join(targetDir, "src", "blocks", ".gitkeep"))
  ).toBe(true);
  expect(
    fs.existsSync(path.join(targetDir, "src", "bindings", ".gitkeep"))
  ).toBe(true);
  expect(
    fs.existsSync(path.join(targetDir, "src", "patterns", ".gitkeep"))
  ).toBe(true);
  expect(fs.existsSync(path.join(targetDir, "scripts", "sync-project.ts"))).toBe(
    true
  );
  const workspaceSyncProjectSource = fs.readFileSync(
    path.join(targetDir, "scripts", "sync-project.ts"),
    "utf8"
  );
  expect(workspaceSyncProjectSource).toContain("spawnSync");
  expect(workspaceSyncProjectSource).toContain(
    "shell: process.platform === 'win32'"
  );
  expect(workspaceSyncProjectSource).toContain("spawnSync( 'ttsx', args");
  expect(workspaceSyncProjectSource).not.toContain("getLocalTtsxBinary");
});

test.each(["7.0", "6.9"] as const)(
  "official workspace templates accept local path references with WordPress %s compatibility",
  async (wpVersion) => {
    const targetDir = path.join(
      tempRoot,
      `demo-workspace-template-local-path-${wpVersion.replace(".", "-")}`
    );

    await scaffoldProject({
      projectDir: targetDir,
      templateId: path.resolve(packageRoot, "..", "create-workspace-template"),
      packageManager: "npm",
      noInstall: true,
      withMigrationUi: true,
      wpVersion,
      answers: {
        author: "Test Runner",
        description: "Demo empty workspace local path",
        namespace: "demo-space",
        phpPrefix: "demo_space",
        slug: "demo-workspace-template-local-path",
        textDomain: "demo-space",
        title: "Demo Workspace Template Local Path",
      },
    });

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
    );
    const pluginBootstrap = fs.readFileSync(
      path.join(targetDir, "demo-workspace-template-local-path.php"),
      "utf8"
    );

    expect(packageJson.wpTypia?.templatePackage).toBe(
      workspaceTemplatePackageManifest.name
    );
    expect(packageJson.scripts["migration:doctor"]).toContain("wp-typia");
    expect(pluginBootstrap).toContain("Requires at least: 6.7");
    expect(pluginBootstrap).toContain(`Tested up to:      ${wpVersion}`);
    expect(pluginBootstrap).toContain("Requires PHP:      8.0");
  }
);

test("workspace-shaped direct wp-typia templates accept local path references with migration UI", async () => {
  const targetDir = path.join(tempRoot, "demo-external-workspace-template-local-path");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: path.join(createBlockExternalFixturePath, "plugin-templates"),
    packageManager: "npm",
    noInstall: true,
    withMigrationUi: true,
    answers: {
      author: "Test Runner",
      description: "Demo external workspace local path",
      namespace: "demo-space",
      phpPrefix: "demo_space",
      slug: "demo-external-workspace-template-local-path",
      textDomain: "demo-space",
      title: "Demo External Workspace Template Local Path",
    },
  });

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
  );

  expect(packageJson.wpTypia?.templatePackage).toBe(
    "@scope/external-workspace-template"
  );
  expect(packageJson.scripts["migration:doctor"]).toContain("wp-typia");
});

test("official workspace template escapes apostrophes in pattern category labels", async () => {
  const targetDir = path.join(tempRoot, "johns-workspace-template");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: workspaceTemplatePackageManifest.name,
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      description: "Workspace title escaping",
      namespace: "johns-space",
      phpPrefix: "johns_space",
      slug: "johns-workspace-template",
      textDomain: "johns-space",
      title: "John's Blocks",
    },
  });

  const bootstrapSource = fs.readFileSync(
    path.join(targetDir, "johns-workspace-template.php"),
    "utf8"
  );

  expect(bootstrapSource).toContain("sprintf(");
  expect(bootstrapSource).toContain("__( '%s Patterns', 'johns-space' )");
  expect(bootstrapSource).toContain('"John\'s Blocks"');
});

test("rendered template paths cannot escape the target directory", async () => {
  const templateRoot = fs.mkdtempSync(
    path.join(tempRoot, "render-escape-template-")
  );
  const targetDir = fs.mkdtempSync(
    path.join(tempRoot, "render-escape-target-")
  );

  fs.writeFileSync(
    path.join(templateRoot, "{{fileName}}.mustache"),
    "escaped",
    "utf8"
  );

  await expect(
    copyRenderedDirectory(templateRoot, targetDir, {
      fileName: "../outside",
    })
  ).rejects.toThrow("Rendered template path escapes target directory");
});

test("rejects unsupported variant usage for built-in templates", async () => {
  await expect(
    scaffoldProject({
      projectDir: path.join(tempRoot, "demo-invalid-built-in-variant"),
      templateId: "basic",
      variant: "hero",
      packageManager: "bun",
      noInstall: true,
      answers: {
        author: "Test Runner",
        description: "Invalid built-in variant usage",
        namespace: "create-block",
        slug: "invalid-built-in-variant",
        title: "Invalid Built In Variant",
      },
    })
  ).rejects.toThrow(
    "--variant is only supported for official external template configs."
  );
});

test("rejects unsupported variant usage for raw create-block subset sources", async () => {
  await expect(
    scaffoldProject({
      projectDir: path.join(tempRoot, "demo-invalid-remote-variant"),
      templateId: createBlockSubsetFixturePath,
      variant: "hero",
      packageManager: "bun",
      noInstall: true,
      answers: {
        author: "Test Runner",
        description: "Invalid remote variant usage",
        namespace: "create-block",
        slug: "invalid-remote-variant",
        title: "Invalid Remote Variant",
      },
    })
  ).rejects.toThrow(
    "--variant is only supported for official external template configs."
  );
});

test("parses github template locators with refs", () => {
  expect(
    parseGitHubTemplateLocator("github:owner/repo/templates/card#main")
  ).toEqual({
    owner: "owner",
    repo: "repo",
    ref: "main",
    sourcePath: "templates/card",
  });
});

test("removed built-in template ids are rejected consistently during template locator parsing", () => {
  expect(() => parseTemplateLocator("persisted")).toThrow(
    'Built-in template "persisted" was removed. Use --template persistence --persistence-policy authenticated instead.'
  );
});

test("parses npm template locators for package specs", () => {
  expect(parseNpmTemplateLocator("@scope/template-package@^1.2.0")).toEqual({
    fetchSpec: "^1.2.0",
    name: "@scope/template-package",
    raw: "@scope/template-package@^1.2.0",
    rawSpec: "^1.2.0",
    type: "range",
  });
});

test("template id resolution preserves explicit unscoped npm template specs", async () => {
  await expect(
    resolveTemplateId({
      templateId: "react",
    })
  ).resolves.toBe("react");

  await expect(
    resolveTemplateId({
      templateId: "my-template",
    })
  ).resolves.toBe("my-template");

  await expect(
    resolveTemplateId({
      templateId: "my-template@latest",
    })
  ).resolves.toBe("my-template@latest");
});

test("template id resolution preserves Windows absolute template paths", async () => {
  await expect(
    resolveTemplateId({
      templateId: String.raw`C:\templates\my-template`,
    })
  ).resolves.toBe(String.raw`C:\templates\my-template`);
});

test("normalizes the workspace template alias to the official package id", async () => {
  await expect(
    resolveTemplateId({
      templateId: "workspace",
    })
  ).resolves.toBe(workspaceTemplatePackageManifest.name);

  await expect(
    resolveTemplateId({
      templateId: workspaceTemplatePackageManifest.name,
    })
  ).resolves.toBe(workspaceTemplatePackageManifest.name);

  await expect(
    resolveTemplateId({
      isInteractive: true,
      selectTemplate: async () => "workspace",
    })
  ).resolves.toBe(workspaceTemplatePackageManifest.name);
});

test("workspace alias scaffolds through the official local template resolver", async () => {
  const targetDir = path.join(tempRoot, "demo-workspace-template-alias");

  const result = await scaffoldProject({
    projectDir: targetDir,
    templateId: "workspace",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      description: "Demo empty workspace alias",
      namespace: "demo-space",
      phpPrefix: "demo_space",
      slug: "demo-workspace-template-alias",
      textDomain: "demo-space",
      title: "Demo Workspace Template Alias",
    },
  });

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
  );

  expect(result.templateId).toBe(workspaceTemplatePackageManifest.name);
  expect(packageJson.wpTypia).toEqual({
    projectType: "workspace",
    templatePackage: workspaceTemplatePackageManifest.name,
    namespace: "demo-space",
    textDomain: "demo-space",
    phpPrefix: "demo_space",
  });
});

test("npm package template specs can scaffold through the registry resolver", async () => {
  const npmTemplateRoot = fs.mkdtempSync(
    path.join(tempRoot, "npm-template-source-")
  );
  const registryBase = "https://registry.npmjs.org";
  const tarballUrl = `${registryBase}/@demo/create-block-template/-/create-block-template-1.2.3.tgz`;
  const metadataUrl = `${registryBase}/${encodeURIComponent(
    "@demo/create-block-template"
  )}`;
  const tarballPath = path.join(
    npmTemplateRoot,
    "create-block-template-1.2.3.tgz"
  );
  const packageDir = path.join(npmTemplateRoot, "package");
  const originalFetch = globalThis.fetch;
  const originalRegistry = process.env.NPM_CONFIG_REGISTRY;
  const targetDir = path.join(tempRoot, "demo-external-npm");

  fs.mkdirSync(packageDir, { recursive: true });
  fs.cpSync(createBlockExternalFixturePath, packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    JSON.stringify(
      {
        name: "@demo/create-block-template",
        version: "1.2.3",
      },
      null,
      2
    )
  );
  execFileSync("tar", [
    "-czf",
    tarballPath,
    "-C",
    npmTemplateRoot,
    "package",
  ]);
  process.env.NPM_CONFIG_REGISTRY = registryBase;

  globalThis.fetch = (async (input) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    if (requestUrl === metadataUrl) {
      return new Response(
        JSON.stringify({
          "dist-tags": {
            latest: "1.2.3",
          },
          versions: {
            "1.2.3": {
              dist: {
                tarball: tarballUrl,
              },
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    }

    if (requestUrl === tarballUrl) {
      return new Response(fs.readFileSync(tarballPath), { status: 200 });
    }

    throw new Error(
      `Unexpected fetch URL in npm template resolver test: ${requestUrl}`
    );
  }) as typeof fetch;

  try {
    const result = await scaffoldProject({
      projectDir: targetDir,
      templateId: "@demo/create-block-template@^1.2.0",
      variant: "hero",
      packageManager: "npm",
      noInstall: true,
      answers: {
        author: "Test Runner",
        description: "Demo external npm template",
        namespace: "create-block",
        slug: "demo-external-npm",
        title: "Demo External Npm",
      },
    });

    const generatedTypes = fs.readFileSync(
      path.join(targetDir, "src", "types.ts"),
      "utf8"
    );
    expect(result.selectedVariant).toBe("hero");
    expect(generatedTypes).toContain(
      '"variantLabel"?: string & tags.Default<"hero">'
    );
    expect(
      fs.existsSync(path.join(targetDir, "assets", "remote-note.txt"))
    ).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRegistry === undefined) {
      delete process.env.NPM_CONFIG_REGISTRY;
    } else {
      process.env.NPM_CONFIG_REGISTRY = originalRegistry;
    }
  }
});

test("npm package template specs reject explicit ranges that do not match published versions", async () => {
  const registryBase = "https://registry.npmjs.org";
  const metadataUrl = `${registryBase}/${encodeURIComponent(
    "@demo/create-block-template"
  )}`;
  const originalFetch = globalThis.fetch;
  const originalRegistry = process.env.NPM_CONFIG_REGISTRY;

  process.env.NPM_CONFIG_REGISTRY = registryBase;
  globalThis.fetch = (async (input) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    if (requestUrl === metadataUrl) {
      return new Response(
        JSON.stringify({
          "dist-tags": {
            latest: "1.2.3",
          },
          versions: {
            "1.2.3": {
              dist: {
                tarball: `${registryBase}/@demo/create-block-template/-/create-block-template-1.2.3.tgz`,
              },
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    }

    throw new Error(
      `Unexpected fetch URL in npm template resolver range test: ${requestUrl}`
    );
  }) as typeof fetch;

  try {
    await expect(
      scaffoldProject({
        projectDir: path.join(tempRoot, "demo-external-range-miss"),
        templateId: "@demo/create-block-template@^9.0.0",
        packageManager: "npm",
        noInstall: true,
        answers: {
          author: "Test Runner",
          description: "Demo external npm range miss",
          namespace: "create-block",
          slug: "demo-external-range-miss",
          title: "Demo External Range Miss",
        },
      })
    ).rejects.toThrow('Requested "^9.0.0"');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRegistry === undefined) {
      delete process.env.NPM_CONFIG_REGISTRY;
    } else {
      process.env.NPM_CONFIG_REGISTRY = originalRegistry;
    }
  }
});
});
