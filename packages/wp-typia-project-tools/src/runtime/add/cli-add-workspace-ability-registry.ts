import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { readOptionalUtf8File, pathExists } from '../shared/fs-async.js';
import {
	buildAbilityRegistrySource,
} from './cli-add-workspace-ability-templates.js';
import {
  ABILITY_REGISTRY_END_MARKER,
  ABILITY_REGISTRY_START_MARKER,
} from './cli-add-workspace-ability-types.js';
import { escapeRegex } from '../shared/php-utils.js';
import {
	readWorkspaceInventoryAsync,
} from '../workspace/workspace-inventory.js';

/**
 * Resolve the workspace ability client registry path, preserving JS registries
 * when older projects already use them.
 */
export async function resolveAbilityRegistryPath(
	projectDir: string,
): Promise<string> {
  const abilitiesDir = path.join(projectDir, 'src', 'abilities');
  for (const candidatePath of [
    path.join(abilitiesDir, 'index.ts'),
    path.join(abilitiesDir, 'index.js'),
  ]) {
    if (await pathExists(candidatePath)) {
      return candidatePath;
    }
  }
  return path.join(abilitiesDir, 'index.ts');
}

async function readAbilityRegistrySlugs(registryPath: string): Promise<string[]> {
  const source = await readOptionalUtf8File(registryPath);
  if (source === null) {
    return [];
  }

  return Array.from(
		source.matchAll(
			/^\s*export\s+\*\s+from\s+['"]\.\/([^/'"]+)\/client(?:\.[cm]?[jt]sx?)?['"];?\s*$/gmu,
		),
	).map((match) => match[1]);
}

/**
 * Rewrite the generated ability client registry while preserving existing
 * generated entries and extension-suffixed exports.
 */
export async function writeAbilityRegistry(
	projectDir: string,
	abilitySlug: string,
): Promise<void> {
  const abilitiesDir = path.join(projectDir, 'src', 'abilities');
  const registryPath = await resolveAbilityRegistryPath(projectDir);
  await fsp.mkdir(abilitiesDir, { recursive: true });

  const existingAbilitySlugs = (
		await readWorkspaceInventoryAsync(projectDir)
	).abilities.map((entry) => entry.slug);
  const existingRegistrySlugs = await readAbilityRegistrySlugs(registryPath);
  const nextAbilitySlugs = Array.from(
		new Set([...existingAbilitySlugs, ...existingRegistrySlugs, abilitySlug]),
	).sort();
  const generatedSection = buildAbilityRegistrySource(nextAbilitySlugs);
  const existingSource = (await readOptionalUtf8File(registryPath)) ?? '';
  const generatedSectionPattern = new RegExp(
    `${escapeRegex(ABILITY_REGISTRY_START_MARKER)}[\\s\\S]*?${escapeRegex(ABILITY_REGISTRY_END_MARKER)}\\n?`,
    'u',
  );
  const nextSource = existingSource
    ? generatedSectionPattern.test(existingSource)
      ? existingSource.replace(generatedSectionPattern, generatedSection)
      : `${existingSource.trimEnd()}\n\n${generatedSection}`
    : generatedSection;
  await fsp.writeFile(registryPath, nextSource, 'utf8');
}
