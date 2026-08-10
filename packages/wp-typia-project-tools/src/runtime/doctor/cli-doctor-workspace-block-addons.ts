import fs from 'node:fs';
import path from 'node:path';

import {
  checkExistingFiles,
  createDoctorCheck,
  isWorkspacePhpEntrypointManifestValid,
  resolveWorkspaceBootstrapPath,
  WORKSPACE_FULL_BLOCK_NAME_PATTERN,
  WORKSPACE_PATTERN_MANIFEST,
} from './cli-doctor-workspace-shared.js';
import {
  formatPatternCatalogDiagnostics,
  resolvePatternCatalogContentFile,
  validatePatternCatalog,
} from '../add/pattern-catalog.js';
import {
  hasExecutablePattern,
  hasUncommentedPattern,
} from '../shared/ts-source-masking.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

const WORKSPACE_VARIATIONS_IMPORT_PATTERN =
	/^\s*import\s*\{\s*registerWorkspaceVariations\s*\}\s*from\s*["']\.\/variations["']\s*;?\s*$/mu;
const WORKSPACE_VARIATIONS_CALL_PATTERN = /registerWorkspaceVariations\s*\(\s*\)\s*;?/u;
const WORKSPACE_BLOCK_STYLES_IMPORT_PATTERN =
	/^\s*import\s*\{\s*registerWorkspaceBlockStyles\s*\}\s*from\s*["']\.\/styles["']\s*;?\s*$/mu;
const WORKSPACE_BLOCK_STYLES_CALL_PATTERN =
	/registerWorkspaceBlockStyles\s*\(\s*\)\s*;?/u;
const WORKSPACE_BLOCK_TRANSFORMS_IMPORT_PATTERN =
	/^\s*import\s*\{\s*applyWorkspaceBlockTransforms\s*\}\s*from\s*["']\.\/transforms["']\s*;?\s*$/mu;
const WORKSPACE_BLOCK_TRANSFORMS_CALL_PATTERN =
	/applyWorkspaceBlockTransforms\s*\(\s*registration\s*\.\s*settings\s*\)\s*;?/u;

function checkWorkspacePatternBootstrap(
	projectDir: string,
	packageName: string,
	patterns: WorkspaceInventory['patterns'],
): DoctorCheck {
  const bootstrapPath = resolveWorkspaceBootstrapPath(projectDir, packageName);
  if (!fs.existsSync(bootstrapPath)) {
    return createDoctorCheck(
      'Pattern bootstrap',
      'fail',
      `Missing ${path.basename(bootstrapPath)}`,
    );
  }
  const source = fs.readFileSync(bootstrapPath, 'utf8');
  const hasCategoryAnchor = source.includes('register_block_pattern_category');
  const hasPatternManifest = source.includes(WORKSPACE_PATTERN_MANIFEST);
  const hasValidManifest = isWorkspacePhpEntrypointManifestValid(
    projectDir,
    WORKSPACE_PATTERN_MANIFEST,
    patterns.map((pattern) =>
      (resolvePatternCatalogContentFile(pattern) ??
        `src/patterns/${pattern.slug}.php`)
        .replace(/\\/gu, '/')
        .replace(/^src\/patterns\//u, ''),
    ),
  );
  return createDoctorCheck(
    'Pattern bootstrap',
    hasCategoryAnchor && hasPatternManifest && hasValidManifest
      ? 'pass'
      : 'fail',
    hasCategoryAnchor && hasPatternManifest && hasValidManifest
      ? 'Pattern category and literal manifest hooks are present'
      : 'Missing pattern category registration or stale pattern manifest hook',
  );
}

function checkVariationEntrypoint(projectDir: string, blockSlug: string): DoctorCheck {
  const entryPath = path.join(
    projectDir,
    'src',
    'blocks',
    blockSlug,
    'index.tsx',
  );
  if (!fs.existsSync(entryPath)) {
    return createDoctorCheck(
      `Variation entrypoint ${blockSlug}`,
      'fail',
      `Missing ${path.relative(projectDir, entryPath)}`,
    );
  }
  const source = fs.readFileSync(entryPath, 'utf8');
  const hasImport = hasUncommentedPattern(
    source,
    WORKSPACE_VARIATIONS_IMPORT_PATTERN,
  );
  const hasCall = hasExecutablePattern(
    source,
    WORKSPACE_VARIATIONS_CALL_PATTERN,
  );
  return createDoctorCheck(
    `Variation entrypoint ${blockSlug}`,
    hasImport && hasCall ? 'pass' : 'fail',
    hasImport && hasCall
      ? 'Variations registration hook is present'
      : 'Missing ./variations import or registerWorkspaceVariations() call',
  );
}

function checkBlockStyleEntrypoint(projectDir: string, blockSlug: string): DoctorCheck {
  const entryPath = path.join(
    projectDir,
    'src',
    'blocks',
    blockSlug,
    'index.tsx',
  );
  if (!fs.existsSync(entryPath)) {
    return createDoctorCheck(
      `Block style entrypoint ${blockSlug}`,
      'fail',
      `Missing ${path.relative(projectDir, entryPath)}`,
    );
  }
  const source = fs.readFileSync(entryPath, 'utf8');
  const hasImport = hasUncommentedPattern(
    source,
    WORKSPACE_BLOCK_STYLES_IMPORT_PATTERN,
  );
  const hasCall = hasExecutablePattern(
    source,
    WORKSPACE_BLOCK_STYLES_CALL_PATTERN,
  );
  return createDoctorCheck(
    `Block style entrypoint ${blockSlug}`,
    hasImport && hasCall ? 'pass' : 'fail',
    hasImport && hasCall
      ? 'Block style registration hook is present'
      : 'Missing ./styles import or registerWorkspaceBlockStyles() call',
  );
}

function checkBlockTransformEntrypoint(
	projectDir: string,
	blockSlug: string,
): DoctorCheck {
  const entryPath = path.join(
    projectDir,
    'src',
    'blocks',
    blockSlug,
    'index.tsx',
  );
  if (!fs.existsSync(entryPath)) {
    return createDoctorCheck(
      `Block transform entrypoint ${blockSlug}`,
      'fail',
      `Missing ${path.relative(projectDir, entryPath)}`,
    );
  }
  const source = fs.readFileSync(entryPath, 'utf8');
  const hasImport = hasUncommentedPattern(
    source,
    WORKSPACE_BLOCK_TRANSFORMS_IMPORT_PATTERN,
  );
  const hasCall = hasExecutablePattern(
    source,
    WORKSPACE_BLOCK_TRANSFORMS_CALL_PATTERN,
  );
  return createDoctorCheck(
    `Block transform entrypoint ${blockSlug}`,
    hasImport && hasCall ? 'pass' : 'fail',
    hasImport && hasCall
      ? 'Block transform registration hook is present'
      : 'Missing ./transforms import or applyWorkspaceBlockTransforms(registration.settings) call',
  );
}

function checkBlockTransformConfig(
	workspace: WorkspaceProject,
	transform: WorkspaceInventory['blockTransforms'][number],
): DoctorCheck {
  const expectedTo = `${workspace.workspace.namespace}/${transform.block}`;
  const issues: string[] = [];
  if (!WORKSPACE_FULL_BLOCK_NAME_PATTERN.test(transform.from)) {
    issues.push('from must use full namespace/block format');
  }
  if (transform.to !== expectedTo) {
    issues.push(
      `to must equal "${expectedTo}" for workspace block "${transform.block}"`,
    );
  }

  return createDoctorCheck(
    `Block transform config ${transform.block}/${transform.slug}`,
    issues.length === 0 ? 'pass' : 'fail',
    issues.length === 0
      ? `${transform.from} transforms into ${transform.to}`
      : issues.join('; '),
  );
}

/**
 * Collect variation, block style, transform, and pattern doctor checks.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param inventory Parsed workspace inventory from `scripts/block-config.ts`.
 * @param registeredBlockSlugs Block slugs already declared in the inventory.
 * @returns Ordered add-on and pattern doctor checks.
 */
export function getWorkspaceBlockAddonDoctorChecks(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
	registeredBlockSlugs: ReadonlySet<string>,
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const variationTargetBlocks = new Set<string>();
  for (const variation of inventory.variations) {
    if (!registeredBlockSlugs.has(variation.block)) {
      checks.push(
        createDoctorCheck(
          `Variation ${variation.block}/${variation.slug}`,
          'fail',
          `Variation references unknown block "${variation.block}"`,
        ),
      );
      continue;
    }

    variationTargetBlocks.add(variation.block);
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `Variation ${variation.block}/${variation.slug}`,
        [variation.file],
      ),
    );
  }
  for (const blockSlug of variationTargetBlocks) {
    checks.push(checkVariationEntrypoint(workspace.projectDir, blockSlug));
  }

  const blockStyleTargetBlocks = new Set<string>();
  for (const blockStyle of inventory.blockStyles) {
    if (!registeredBlockSlugs.has(blockStyle.block)) {
      checks.push(
        createDoctorCheck(
          `Block style ${blockStyle.block}/${blockStyle.slug}`,
          'fail',
          `Block style references unknown block "${blockStyle.block}"`,
        ),
      );
      continue;
    }

    blockStyleTargetBlocks.add(blockStyle.block);
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `Block style ${blockStyle.block}/${blockStyle.slug}`,
        [blockStyle.file],
      ),
    );
  }
  for (const blockSlug of blockStyleTargetBlocks) {
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `Block style registry ${blockSlug}`,
        [path.join('src', 'blocks', blockSlug, 'styles', 'index.ts')],
      ),
    );
    checks.push(checkBlockStyleEntrypoint(workspace.projectDir, blockSlug));
  }

  const blockTransformTargetBlocks = new Set<string>();
  for (const blockTransform of inventory.blockTransforms) {
    if (!registeredBlockSlugs.has(blockTransform.block)) {
      checks.push(
        createDoctorCheck(
          `Block transform ${blockTransform.block}/${blockTransform.slug}`,
          'fail',
          `Block transform references unknown block "${blockTransform.block}"`,
        ),
      );
      continue;
    }

    blockTransformTargetBlocks.add(blockTransform.block);
    checks.push(checkBlockTransformConfig(workspace, blockTransform));
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `Block transform ${blockTransform.block}/${blockTransform.slug}`,
        [blockTransform.file],
      ),
    );
  }
  for (const blockSlug of blockTransformTargetBlocks) {
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `Block transform registry ${blockSlug}`,
        [path.join('src', 'blocks', blockSlug, 'transforms', 'index.ts')],
      ),
    );
    checks.push(checkBlockTransformEntrypoint(workspace.projectDir, blockSlug));
  }

  const shouldCheckPatternBootstrap =
		inventory.patterns.length > 0 ||
		fs.existsSync(path.join(workspace.projectDir, 'src', 'patterns'));
  if (shouldCheckPatternBootstrap) {
    checks.push(
      checkWorkspacePatternBootstrap(
        workspace.projectDir,
        workspace.packageName,
        inventory.patterns,
      ),
    );
  }
  if (inventory.patterns.length > 0) {
    const catalogValidation = validatePatternCatalog(inventory.patterns, {
      projectDir: workspace.projectDir,
    });
    checks.push(
      createDoctorCheck(
        'Pattern catalog',
        catalogValidation.errors.length > 0
          ? 'fail'
          : catalogValidation.warnings.length > 0
            ? 'warn'
            : 'pass',
        catalogValidation.diagnostics.length > 0
          ? formatPatternCatalogDiagnostics(catalogValidation.diagnostics)
          : 'Pattern catalog metadata is valid',
      ),
    );
  }
  for (const pattern of inventory.patterns) {
    checks.push(
      checkExistingFiles(workspace.projectDir, `Pattern ${pattern.slug}`, [
        resolvePatternCatalogContentFile(pattern),
      ]),
    );
  }

  return checks;
}
