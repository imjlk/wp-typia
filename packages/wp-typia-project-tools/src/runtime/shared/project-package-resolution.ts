import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { isProjectLocalRelativePath } from '../doctor/cli-doctor-standalone-shared.js';

interface PackageManifestShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: unknown;
}

function readPackageManifest(packageJsonPath: string): PackageManifestShape | null {
  try {
    return JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8'),
    ) as PackageManifestShape;
  } catch {
    return null;
  }
}

function manifestDeclaresDependency(
  manifest: PackageManifestShape,
  packageName: string,
): boolean {
  return [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ].some(
    (dependencies) =>
      dependencies &&
      Object.prototype.hasOwnProperty.call(dependencies, packageName),
  );
}

function getWorkspacePatterns(manifest: PackageManifestShape): string[] {
  const { workspaces } = manifest;
  if (Array.isArray(workspaces)) {
    return workspaces.filter(
      (pattern): pattern is string => typeof pattern === 'string',
    );
  }
  if (
    workspaces === null ||
    typeof workspaces !== 'object' ||
    !('packages' in workspaces) ||
    !Array.isArray(workspaces.packages)
  ) {
    return [];
  }
  return workspaces.packages.filter(
    (pattern): pattern is string => typeof pattern === 'string',
  );
}

function workspacePatternMatches(
  projectRelativePath: string,
  pattern: string,
): boolean {
  const normalizedPattern = pattern.replace(/^\.\//u, '').replace(/\/$/u, '');
  try {
    return path.posix.matchesGlob(projectRelativePath, normalizedPattern);
  } catch {
    return false;
  }
}

function findDeclaringWorkspaceRoot(
  projectDir: string,
  packageName: string,
): string | null {
  const projectManifest = readPackageManifest(
    path.join(projectDir, 'package.json'),
  );
  if (
    !projectManifest ||
    !manifestDeclaresDependency(projectManifest, packageName)
  ) {
    return null;
  }

  let candidateRoot = path.dirname(projectDir);
  while (candidateRoot !== path.dirname(candidateRoot)) {
    const manifest = readPackageManifest(
      path.join(candidateRoot, 'package.json'),
    );
    if (manifest) {
      const projectRelativePath = path
        .relative(candidateRoot, projectDir)
        .split(path.sep)
        .join('/');
      const patterns = getWorkspacePatterns(manifest);
      const included = patterns.some(
        (pattern) =>
          !pattern.startsWith('!') &&
          workspacePatternMatches(projectRelativePath, pattern),
      );
      const excluded = patterns.some(
        (pattern) =>
          pattern.startsWith('!') &&
          workspacePatternMatches(projectRelativePath, pattern.slice(1)),
      );
      if (included && !excluded) {
        return candidateRoot;
      }
    }
    candidateRoot = path.dirname(candidateRoot);
  }
  return null;
}

function resolveWithinPackageEntry(
  packageEntry: string,
  resolvedPath: string,
): string | null {
  if (!fs.existsSync(packageEntry)) {
    return null;
  }
  const packageRoot = fs.realpathSync(packageEntry);
  const realResolvedPath = fs.realpathSync(resolvedPath);
  return isProjectLocalRelativePath(
    path.relative(packageRoot, realResolvedPath),
  )
    ? realResolvedPath
    : null;
}

function getPackageNodeModulesEntry(
  rootDir: string,
  packageName: string,
): string {
  return path.join(rootDir, 'node_modules', ...packageName.split('/'));
}

/** Resolve a package entry only when it belongs to the requesting project. */
export function resolveFromProject(
  projectDir: string,
  packageName: string,
  resolutionSpecifier: string,
): string | null {
  const projectRequire = createRequire(path.join(projectDir, 'package.json'));
  try {
    const resolvedPath = projectRequire.resolve(resolutionSpecifier);
    const pnpVersion: unknown = process.versions.pnp;
    if (
      typeof pnpVersion === 'number' ||
      (typeof pnpVersion === 'string' && pnpVersion.length > 0)
    ) {
      const pnpApi = projectRequire('pnpapi') as {
        findPackageLocator(location: string): {
          name: string | null;
          reference: string | null;
        } | null;
        getLocator(
          name: string,
          reference: string | [string, string],
        ): { name: string; reference: string };
        getPackageInformation(locator: {
          name: string | null;
          reference: string | null;
        }): {
          packageDependencies: Map<
            string,
            string | [string, string] | null
          >;
        } | null;
      };
      const issuerLocator = pnpApi.findPackageLocator(
        path.join(projectDir, 'package.json'),
      );
      const resolvedLocator = pnpApi.findPackageLocator(resolvedPath);
      if (!issuerLocator || !resolvedLocator) {
        return null;
      }
      const issuerInformation = pnpApi.getPackageInformation(issuerLocator);
      if (!issuerInformation) {
        return null;
      }
      const dependencyReference =
        issuerInformation.packageDependencies.get(packageName);
      if (dependencyReference === undefined || dependencyReference === null) {
        return null;
      }
      const expectedLocator = pnpApi.getLocator(
        packageName,
        dependencyReference,
      );
      // Keep the virtual path so Yarn can retain its peer-dependency locator.
      return resolvedLocator.name === expectedLocator.name &&
        resolvedLocator.reference === expectedLocator.reference
        ? resolvedPath
        : null;
    }

    const localPackageEntry = getPackageNodeModulesEntry(
      projectDir,
      packageName,
    );
    if (fs.existsSync(localPackageEntry)) {
      return resolveWithinPackageEntry(localPackageEntry, resolvedPath);
    }
    const workspaceRoot = findDeclaringWorkspaceRoot(projectDir, packageName);
    return workspaceRoot
      ? resolveWithinPackageEntry(
          getPackageNodeModulesEntry(workspaceRoot, packageName),
          resolvedPath,
        )
      : null;
  } catch {
    return null;
  }
}

/** Check whether a package entry resolves from the requesting project. */
export function canResolveFromProject(
  projectDir: string,
  packageName: string,
  resolutionSpecifier: string,
): boolean {
  return (
    resolveFromProject(projectDir, packageName, resolutionSpecifier) !== null
  );
}
