import path from 'node:path';

import { detectJsonIndent, safeJsonParse } from '../shared/json-utils.js';
import { DEFAULT_WORDPRESS_DATA_VERSION } from '../shared/package-versions.js';
import { patchFile } from './cli-add-shared.js';

interface WorkspacePackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Ensure legacy workspaces can resolve the editor store used by generated
 * persistence blocks. Existing dependency ranges stay authoritative.
 */
export async function ensurePersistentBlockIdentityDependency(
	projectDir: string,
	required: boolean,
): Promise<boolean> {
  if (!required) {
    return false;
  }

  const packageJsonPath = path.join(projectDir, 'package.json');
  let added = false;
  await patchFile(packageJsonPath, (source) => {
		const packageJson = safeJsonParse<WorkspacePackageJson>(source, {
			context: 'workspace package manifest',
			filePath: packageJsonPath,
		});
		if (
			packageJson.dependencies?.['@wordpress/data'] ||
			packageJson.devDependencies?.['@wordpress/data']
		) {
			return source;
		}

		packageJson.dependencies = {
			...(packageJson.dependencies ?? {}),
			'@wordpress/data': DEFAULT_WORDPRESS_DATA_VERSION,
		};
		added = true;
		return `${JSON.stringify(packageJson, null, detectJsonIndent(source))}\n`;
	});

  return added;
}
