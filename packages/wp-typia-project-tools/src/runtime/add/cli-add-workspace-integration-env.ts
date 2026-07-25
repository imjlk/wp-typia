import path from 'node:path';

import {
  assertValidGeneratedSlug,
  assertValidIntegrationEnvService,
  normalizeBlockSlug,
  type IntegrationEnvServiceId,
  type RunAddIntegrationEnvCommandOptions,
} from './cli-add-shared.js';
import {
  appendMissingLines,
  writeFileIfAbsent,
  writeNewScaffoldFile,
} from './cli-add-workspace-integration-env-files.js';
import {
  addIntegrationEnvPackageJsonEntries,
  mutateIntegrationEnvPackageJson,
} from './cli-add-workspace-integration-env-package-json.js';
import {
  buildDockerComposeSource,
  buildEnvExampleSource,
  buildIntegrationEnvReadmeSource,
  buildIntegrationSmokeScriptSource,
  buildWpEnvConfigSource,
} from './cli-add-workspace-integration-env-source-emitters.js';
import { executeWorkspaceMutationPlan } from './cli-add-workspace-mutation.js';
import { pathExists } from '../shared/fs-async.js';
import { resolveWorkspaceProject } from '../workspace/workspace-project.js';

/**
 * Runtime result returned after adding an integration environment starter.
 *
 * @property integrationEnvSlug Normalized slug used for generated script and
 * documentation paths.
 * @property projectDir Absolute official workspace directory that was updated.
 * @property service Canonical local service starter id selected for the scaffold.
 * @property warnings Optional non-fatal preservation notices for existing files
 * or scripts.
 * @property withReleaseZip Whether release zip packaging scripts were added.
 * @property withWpEnv Whether the generated scaffold included the wp-env preset.
 */
export interface RunAddIntegrationEnvCommandResult {
  integrationEnvSlug: string;
  projectDir: string;
  service: IntegrationEnvServiceId;
  warnings?: string[];
  withReleaseZip: boolean;
  withWpEnv: boolean;
}

/**
 * Add an opt-in local WordPress integration environment starter to an official
 * workspace.
 */
export async function runAddIntegrationEnvCommand({
	cwd = process.cwd(),
	integrationEnvName,
	service,
	withReleaseZip = false,
	withWpEnv = false,
}: RunAddIntegrationEnvCommandOptions): Promise<RunAddIntegrationEnvCommandResult> {
  const workspace = resolveWorkspaceProject(cwd);
  const integrationEnvSlug = assertValidGeneratedSlug(
    'Integration environment name',
    normalizeBlockSlug(integrationEnvName),
    'wp-typia add integration-env <name> [--wp-env] [--release-zip]',
  );
  const serviceId = assertValidIntegrationEnvService(service);
  const warnings: string[] = [];

  const packageJsonPath = path.join(workspace.projectDir, 'package.json');
  const gitignorePath = path.join(workspace.projectDir, '.gitignore');
  const envExamplePath = path.join(workspace.projectDir, '.env.example');
  const wpEnvPath = path.join(workspace.projectDir, '.wp-env.json');
  const dockerComposePath = path.join(
    workspace.projectDir,
    'docker-compose.integration.yml',
  );
  const smokeDir = path.join(
    workspace.projectDir,
    'scripts',
    'integration-smoke',
  );
  const docsDir = path.join(workspace.projectDir, 'docs', 'integration-env');
  const smokeScriptPath = path.join(smokeDir, `${integrationEnvSlug}.mjs`);
  const docsPath = path.join(docsDir, `${integrationEnvSlug}.md`);
  const shouldRemoveSmokeDirOnRollback = !(await pathExists(smokeDir));
  const shouldRemoveDocsDirOnRollback = !(await pathExists(docsDir));

  await executeWorkspaceMutationPlan({
		filePaths: [
			packageJsonPath,
			gitignorePath,
			envExamplePath,
			...(withWpEnv ? [wpEnvPath] : []),
			...(serviceId === 'docker-compose' ? [dockerComposePath] : []),
		],
		targetPaths: [
			smokeScriptPath,
			docsPath,
			...(shouldRemoveSmokeDirOnRollback ? [smokeDir] : []),
			...(shouldRemoveDocsDirOnRollback ? [docsDir] : []),
		],
		run: async () => {
			await writeNewScaffoldFile(
				smokeScriptPath,
				buildIntegrationSmokeScriptSource(integrationEnvSlug),
			);
			await writeNewScaffoldFile(
				docsPath,
				buildIntegrationEnvReadmeSource({
					integrationEnvSlug,
					service: serviceId,
					withReleaseZip,
					withWpEnv,
				}),
			);
			await appendMissingLines(envExamplePath, [
				...buildEnvExampleSource(serviceId).trimEnd().split('\n'),
			]);
			await appendMissingLines(gitignorePath, ['.env', '.env.local']);

			if (withWpEnv) {
				await writeFileIfAbsent({
					filePath: wpEnvPath,
					source: buildWpEnvConfigSource(),
					warnings,
				});
			}
			if (serviceId === 'docker-compose') {
				await writeFileIfAbsent({
					filePath: dockerComposePath,
					source: buildDockerComposeSource(),
					warnings,
				});
			}

			await mutateIntegrationEnvPackageJson(workspace.projectDir, (packageJson) =>
				addIntegrationEnvPackageJsonEntries({
					integrationEnvSlug,
					packageManager: workspace.packageManager,
					packageJson,
					service: serviceId,
					withReleaseZip,
					warnings,
					withWpEnv,
				}),
			);
		},
	});

  return {
    integrationEnvSlug,
    projectDir: workspace.projectDir,
    service: serviceId,
    warnings: warnings.length > 0 ? warnings : undefined,
    withReleaseZip,
    withWpEnv,
  };
}
