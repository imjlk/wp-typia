import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { isProjectLocalRelativePath } from '../doctor/cli-doctor-standalone-shared.js';

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

    const localPackageEntry = path.join(
      projectDir,
      'node_modules',
      ...packageName.split('/'),
    );
    if (!fs.existsSync(localPackageEntry)) {
      return null;
    }
    const localPackageRoot = fs.realpathSync(localPackageEntry);
    const realResolvedPath = fs.realpathSync(resolvedPath);
    return isProjectLocalRelativePath(
      path.relative(localPackageRoot, realResolvedPath),
    )
      ? realResolvedPath
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
