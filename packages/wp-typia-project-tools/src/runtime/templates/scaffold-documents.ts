import { getPrimaryDevelopmentScript } from './local-dev-presets.js';
import {
	getCompoundExtensionWorkflowSection,
	getInitialCommitCommands,
	getInitialCommitNote,
  getOptionalOnboardingNote,
  getOptionalOnboardingSteps,
  getQuickStartWorkflowNote,
  getPhpRestExtensionPointsSection,
  getTemplateSourceOfTruthNote,
} from './scaffold-onboarding.js';
import type { PackageManagerId } from '../shared/package-managers.js';
import {
  formatPackageExecCommand,
  formatInstallCommand,
  formatRunScript,
} from '../shared/package-managers.js';
import { getPackageVersions } from '../shared/package-versions.js';
import type { ScaffoldTemplateVariables } from './scaffold.js';
import { getScaffoldTemplateVariableGroups } from './scaffold-template-variable-groups.js';
import {
	OFFICIAL_WORKSPACE_TEMPLATE_ALIAS,
	OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE,
	isBuiltInTemplateId,
	normalizeTemplateLookupId,
} from './template-registry.js';

function formatReadmeTemplateIdentity(templateId: string): string {
	const normalizedTemplateId = normalizeTemplateLookupId(templateId);

	if (normalizedTemplateId === OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE) {
		return [
			`- Alias: ${OFFICIAL_WORKSPACE_TEMPLATE_ALIAS}`,
			`- Package: ${OFFICIAL_WORKSPACE_TEMPLATE_PACKAGE}`,
			'- Type: official workspace scaffold',
		].join('\n');
	}

	if (normalizedTemplateId === 'query-loop') {
		return ['- Family: query-loop', '- Type: create-time core/query variation scaffold'].join(
			'\n',
		);
	}

	if (isBuiltInTemplateId(normalizedTemplateId)) {
		return [`- Family: ${normalizedTemplateId}`, '- Type: built-in block scaffold'].join('\n');
	}

	return [`- Template id: ${templateId}`, '- Type: custom or external scaffold'].join('\n');
}

function getPackageManagerInstallGuidance(packageManager: PackageManagerId): string {
	if (packageManager !== 'npm') {
		return '';
	}

	const installCommand = formatInstallCommand(packageManager);

	return [
		'',
		`> npm note: the scaffold uses \`${installCommand}\` for the first install so npm does not spend the initial create flow in the audit resolver. Run \`npm audit\` separately when you want npm vulnerability output.`,
		'> If npm prints React peer dependency noise from WordPress block-editor packages, validate with `npm run typecheck` and `npm run build` before changing WordPress package ranges.',
	].join('\n');
}

/**
 * Builds the generated README markdown for one scaffolded project.
 *
 * @param templateId Scaffold template family or template identifier.
 * @param variables Interpolated scaffold variables used in generated content.
 * @param packageManager Package manager used to format install and script commands.
 * @param options Optional README sections enabled by scaffold presets.
 * @returns Markdown README content for the generated project root.
 */
export function buildReadme(
  templateId: string,
  variables: ScaffoldTemplateVariables,
  packageManager: PackageManagerId,
  {
    withMigrationUi = false,
    withTestPreset = false,
    withWpEnv = false,
  }: {
    withMigrationUi?: boolean;
    withTestPreset?: boolean;
    withWpEnv?: boolean;
  } = {},
): string {
  const variableGroups = getScaffoldTemplateVariableGroups(variables);
  const compoundPersistenceEnabled =
    variableGroups.compound.enabled &&
    variableGroups.compound.persistenceEnabled;
  const optionalOnboardingSteps = getOptionalOnboardingSteps(packageManager, templateId, {
    compoundPersistenceEnabled,
  });
  const initialCommitCommands = getInitialCommitCommands();
  const sourceOfTruthNote = getTemplateSourceOfTruthNote(templateId, {
    compoundPersistenceEnabled,
  });
  const publicPersistencePolicyNote =
    variableGroups.persistence.enabled && variableGroups.persistence.auth.isPublic
      ? 'Public persistence writes use signed short-lived tokens, per-request ids, and coarse rate limiting by default. Add application-specific abuse controls before using the same pattern for high-value metrics or experiments.'
      : null;
  const alternateRenderTargetSection =
    variableGroups.alternateRenderTargets.enabled
      ? `## Alternate Render Targets\n\nThis scaffold keeps \`${templateId === 'compound' ? `src/blocks/${variables.slugKebabCase}/render.php` : 'src/render.php'}\` as the default web render boundary and also generates ${[
          variableGroups.alternateRenderTargets.hasEmail
            ? `\`${templateId === 'compound' ? `src/blocks/${variables.slugKebabCase}/render-email.php` : 'src/render-email.php'}\``
            : null,
          variableGroups.alternateRenderTargets.hasMjml
            ? `\`${templateId === 'compound' ? `src/blocks/${variables.slugKebabCase}/render-mjml.php` : 'src/render-mjml.php'}\``
            : null,
          variableGroups.alternateRenderTargets.hasPlainText
            ? `\`${templateId === 'compound' ? `src/blocks/${variables.slugKebabCase}/render-text.php` : 'src/render-text.php'}\``
            : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(', ')}. All of those entries delegate through \`${templateId === 'compound' ? `src/blocks/${variables.slugKebabCase}/render-targets.php` : 'src/render-targets.php'}\`, so attribute normalization, validation, and render-target adapter hooks stay aligned across web, email, MJML, and plain-text integrations.`
      : '';
  const compoundExtensionWorkflowSection = getCompoundExtensionWorkflowSection(
    packageManager,
    templateId,
  );
  const compoundInnerBlocksSection =
    templateId === 'compound'
      ? `## Compound InnerBlocks Presets\n\nThis scaffold starts with the \`${variables.compoundInnerBlocksPreset}\` preset for compound container authoring. Static nested relationships still belong in each generated \`block.json\` via \`allowedBlocks\`, \`parent\`, and \`ancestor\`, while \`src/blocks/${variables.slugKebabCase}/children.ts\` owns editor-only \`InnerBlocks\` behavior such as \`orientation\`, \`templateLock\`, \`defaultBlock\`, and \`directInsert\`.\n\n- \`freeform\`: unlocked inserter flow with the starter child template.\n- \`ordered\`: vertical ordered flow with \`templateLock="insert"\` and direct inserts.\n- \`horizontal\`: row-like nested authoring with direct inserts.\n- \`locked-structure\`: fully locked starter structure.\n\nWhen you need to change that authoring behavior later, update the preset helpers in \`src/blocks/${variables.slugKebabCase}/children.ts\` and keep fixed child constraints metadata-owned instead of duplicating them in editor props. If you need tighter wrapper ownership or sibling markup control, switch the generated edit components to \`useInnerBlocksProps\` and reuse \`getRootInnerBlocksPropsOptions()\` / \`getChildInnerBlocksPropsOptions( metadata.name )\` so the same preset behavior carries forward without rebuilding the option set by hand.`
      : '';
  const phpRestExtensionPointsSection = getPhpRestExtensionPointsSection(templateId, {
    compoundPersistenceEnabled,
    slug: variables.slug,
  });
  const developmentScript = getPrimaryDevelopmentScript(templateId);
  const noStepsHeading =
    templateId === 'query-loop' ? 'Variation Workflow' : 'Artifact Refresh';
  const wpEnvSection = withWpEnv
    ? `## Local WordPress\n\n\`\`\`bash\n${formatRunScript(packageManager, 'wp-env:start')}\n${formatRunScript(packageManager, 'wp-env:stop')}\n${formatRunScript(packageManager, 'wp-env:reset')}\n\`\`\``
    : '';
  const testPresetSection = withTestPreset
    ? `## Local Test Preset\n\n\`\`\`bash\n${formatRunScript(packageManager, 'wp-env:start:test')}\n${formatRunScript(packageManager, 'wp-env:wait:test')}\n${formatRunScript(packageManager, 'test:e2e')}\n\`\`\`\n\nThe generated smoke test uses \`.wp-env.test.json\` and verifies that the scaffolded block registers in the WordPress editor.`
    : '';
  const migrationSection = withMigrationUi
    ? `## Migration UI\n\nThis scaffold already includes an initialized migration workspace at \`v1\`, generated deprecated/runtime artifacts, and an editor-embedded migration dashboard. Migration versions are schema lineage labels and are separate from your package or plugin release version. Use the existing CLI commands to snapshot, diff, scaffold, verify, and fuzz future schema changes.\n\n\`\`\`bash\n${formatRunScript(packageManager, 'migration:doctor')}\n${formatRunScript(packageManager, 'migration:verify')}\n${formatRunScript(packageManager, 'migration:fuzz')}\n\`\`\`\n\nRun \`migration:init\` only when retrofitting migration support into an older project that was not scaffolded with \`--with-migration-ui\`.`
    : '';
  const advancedSyncSection =
    optionalOnboardingSteps.length > 0
      ? `## Advanced Sync\n\n\`\`\`bash\n${optionalOnboardingSteps.join('\n')}\n\`\`\`\n\n${getOptionalOnboardingNote(packageManager, templateId, {
          compoundPersistenceEnabled,
        })}`
      : `## ${noStepsHeading}\n\n${getOptionalOnboardingNote(packageManager, templateId, {
          compoundPersistenceEnabled,
        })}`;

  return `# ${variables.title}

${variables.description}

## Template

${formatReadmeTemplateIdentity(templateId)}

## Quick Start

\`\`\`bash
${formatInstallCommand(packageManager)}
${formatRunScript(packageManager, developmentScript)}
\`\`\`
${getPackageManagerInstallGuidance(packageManager)}

${getQuickStartWorkflowNote(packageManager, templateId, {
    compoundPersistenceEnabled,
  })}

## Build and Verify

\`\`\`bash
${formatRunScript(packageManager, 'build')}
${formatRunScript(packageManager, 'typecheck')}
${formatPackageExecCommand(
    packageManager,
    `wp-typia@${getPackageVersions().wpTypiaPackageExactVersion}`,
    'doctor',
  )}
\`\`\`

${advancedSyncSection}

## Before First Commit

\`\`\`bash
${initialCommitCommands.join('\n')}
\`\`\`

${getInitialCommitNote()}

${sourceOfTruthNote}${publicPersistencePolicyNote ? `\n\n${publicPersistencePolicyNote}` : ''}${alternateRenderTargetSection ? `\n\n${alternateRenderTargetSection}` : ''}${compoundInnerBlocksSection ? `\n\n${compoundInnerBlocksSection}` : ''}${migrationSection ? `\n\n${migrationSection}` : ''}${compoundExtensionWorkflowSection ? `\n\n${compoundExtensionWorkflowSection}` : ''}${wpEnvSection ? `\n\n${wpEnvSection}` : ''}${testPresetSection ? `\n\n${testPresetSection}` : ''}${phpRestExtensionPointsSection ? `\n\n${phpRestExtensionPointsSection}` : ''}
`;
}

/**
 * Build the default `.gitignore` contents for a scaffolded project.
 *
 * @returns A newline-terminated `.gitignore` string covering dependency, build, editor, OS, and WordPress artifacts.
 */
export function buildGitignore(): string {
  return `# Dependencies
node_modules/
.yarn/
.pnp.*

# Build
build/
dist/

# Editor
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# WordPress
*.log
.wp-env/
`;
}

/**
 * Merge generated and existing text files while keeping line order stable.
 *
 * Existing unique lines are appended after the primary content, duplicate
 * non-empty lines are removed, and runs of more than two blank lines collapse
 * to a single empty separator.
 *
 * @param primaryContent Newly generated text that should appear first.
 * @param existingContent Existing file contents preserved after unique generated lines.
 * @returns The merged text block with a trailing newline.
 */
export function mergeTextLines(primaryContent: string, existingContent: string): string {
  const normalizedPrimary = primaryContent.replace(/\r\n/g, '\n').trimEnd();
  const normalizedExisting = existingContent.replace(/\r\n/g, '\n').trimEnd();
  const mergedLines: string[] = [];
  const seen = new Set<string>();

  for (const line of [...normalizedPrimary.split('\n'), ...normalizedExisting.split('\n')]) {
    if (line.length === 0 && mergedLines[mergedLines.length - 1] === '') {
      continue;
    }
    if (line.length > 0 && seen.has(line)) {
      continue;
    }
    if (line.length > 0) {
      seen.add(line);
    }
    mergedLines.push(line);
  }

  return `${mergedLines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}
