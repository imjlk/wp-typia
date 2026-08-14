/**
 * Shared installer for integrity-pinned npm tarballs used by the parity
 * oracle. Both the `@wordpress/theme` token source and the `globals` DOM
 * global data resolve through this single path so the supply-chain controls
 * (download-or-cache, SHA-512 verification, staging extraction, atomic
 * installation) evolve in one place.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface PinnedTarballOptions {
  /** Human-readable label for failure messages, e.g. `globals 16.5.0`. */
  label: string;
  /** Tarball URL downloaded when the cache is cold. */
  url: string;
  /** Expected `sha512-...` integrity of the tarball contents. */
  integrity: string;
  /** Where the verified tarball is cached for future cold installs. */
  cachePath: string;
  /** Parent directory for the per-run staging directory. */
  stagingParent: string;
  /** Prefix of the per-run staging directory created under `stagingParent`. */
  stagingPrefix: string;
  /** Final installed package root, e.g. `<upstream>/node_modules/globals`. */
  destination: string;
  /** Validates an extracted package root (name and version pin). */
  verify: (packageRoot: string) => void;
  networkTimeoutMs?: number;
}

/** Writes the tarball cache via temp file + rename so a killed run cannot
 * leave a truncated tarball that later integrity checks would trip over. */
function writeTarballCache(cachePath: string, tarball: Buffer): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, tarball);
  fs.renameSync(tempPath, cachePath);
}

export async function installPinnedTarball(
  options: PinnedTarballOptions,
): Promise<void> {
  const networkTimeoutMs = options.networkTimeoutMs ?? 60_000;
  const installedMarker = path.join(options.destination, 'package.json');
  const hasInstalled = fs.existsSync(installedMarker);
  if (hasInstalled && fs.existsSync(options.cachePath)) {
    options.verify(options.destination);
    return;
  }

  let tarball: Buffer;
  if (fs.existsSync(options.cachePath)) {
    tarball = fs.readFileSync(options.cachePath);
  } else {
    let response: Response;
    try {
      response = await fetch(options.url, {
        signal: AbortSignal.timeout(networkTimeoutMs),
      });
    } catch (error) {
      if (hasInstalled) {
        // The install is already valid; cache repopulation is best-effort.
        options.verify(options.destination);
        return;
      }
      throw new Error(
        `Unable to download ${options.label} from ${options.url}: ${String(error)}`,
        { cause: error },
      );
    }
    if (hasInstalled && !response.ok) {
      // The install is already valid; cache repopulation is best-effort
      // for transient registry failures too.
      options.verify(options.destination);
      return;
    }
    assert.equal(
      response.ok,
      true,
      `Unable to download ${options.label} from ${options.url} (HTTP ${response.status})`,
    );
    tarball = Buffer.from(await response.arrayBuffer());
  }
  const integrity = `sha512-${crypto
    .createHash('sha512')
    .update(tarball)
    .digest('base64')}`;
  assert.equal(
    integrity,
    options.integrity,
    `${options.label} tarball integrity mismatch`,
  );
  if (hasInstalled) {
    writeTarballCache(options.cachePath, tarball);
    options.verify(options.destination);
    return;
  }

  fs.mkdirSync(options.stagingParent, { recursive: true });
  const stagingRoot = fs.mkdtempSync(
    path.join(options.stagingParent, options.stagingPrefix),
  );
  try {
    const stagingTarballPath = path.join(stagingRoot, 'package.tgz');
    fs.writeFileSync(stagingTarballPath, tarball);
    execFileSync('tar', ['-xzf', stagingTarballPath, '-C', stagingRoot], {
      timeout: networkTimeoutMs,
    });
    const stagedPackage = path.join(stagingRoot, 'package');
    options.verify(stagedPackage);
    fs.mkdirSync(path.dirname(options.destination), { recursive: true });
    if (
      fs.existsSync(options.destination) &&
      !fs.existsSync(installedMarker)
    ) {
      // Renames are atomic, so a leftover destination without package.json
      // can only be an empty directory from a killed run.
      assert.equal(
        fs.readdirSync(options.destination).length,
        0,
        `${options.label}: refusing to remove non-empty destination without package.json: ${options.destination}`,
      );
      fs.rmSync(options.destination, { force: true, recursive: true });
    }
    try {
      fs.renameSync(stagedPackage, options.destination);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') {
        throw error;
      }
      // A concurrent run won the install race; keep the winner.
    }
    options.verify(options.destination);
    writeTarballCache(options.cachePath, tarball);
  } finally {
    fs.rmSync(stagingRoot, { force: true, recursive: true });
  }
}
