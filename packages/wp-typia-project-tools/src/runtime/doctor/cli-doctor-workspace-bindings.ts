import fs from 'node:fs';
import path from 'node:path';

import { parseScaffoldBlockMetadata } from '@wp-typia/block-runtime/blocks';

import {
  checkExistingFiles,
  createDoctorCheck,
  isWorkspacePhpEntrypointManifestValid,
  resolveWorkspaceBootstrapPath,
  WORKSPACE_BINDING_EDITOR_ASSET,
  WORKSPACE_BINDING_EDITOR_SCRIPT,
  WORKSPACE_BINDING_SERVER_MANIFEST,
} from './cli-doctor-workspace-shared.js';
import { readJsonFileSync } from '../shared/json-utils.js';
import {
  escapeRegex,
  findPhpFunctionRange,
  hasPhpFunctionCall,
  hasPhpFunctionCallWithStringArgument,
  hasPhpFunctionCallWithStringArguments,
  hasPhpLiteralDirectoryInclude,
} from '../shared/php-utils.js';
import {
  assertPostMetaBindingPath,
  loadPostMetaBindingFieldsSync,
} from '../add/post-meta-binding-fields.js';

import type { DoctorCheck } from './cli-doctor.js';
import type { WorkspaceInventory } from '../workspace/workspace-inventory.js';
import type { WorkspaceProject } from '../workspace/workspace-project.js';

function checkWorkspaceBindingBootstrap(
  projectDir: string,
  packageName: string,
  phpPrefix: string,
  bindingSources: WorkspaceInventory['bindingSources'],
): DoctorCheck {
  const bootstrapPath = resolveWorkspaceBootstrapPath(projectDir, packageName);
  if (!fs.existsSync(bootstrapPath)) {
    return createDoctorCheck(
      'Binding bootstrap',
      'fail',
      `Missing ${path.basename(bootstrapPath)}`,
    );
  }

  const source = fs.readFileSync(bootstrapPath, 'utf8');
  const registerFunctionName = `${phpPrefix}_register_binding_sources`;
  const enqueueFunctionName = `${phpPrefix}_enqueue_binding_sources_editor`;
  const registerFunction = findPhpFunctionRange(source, registerFunctionName);
  const enqueueFunction = findPhpFunctionRange(source, enqueueFunctionName);
  const hasServerManifest = registerFunction !== null &&
    hasPhpLiteralDirectoryInclude(
      registerFunction.source,
      WORKSPACE_BINDING_SERVER_MANIFEST,
    );
  const hasValidManifest = isWorkspacePhpEntrypointManifestValid(
    projectDir,
    WORKSPACE_BINDING_SERVER_MANIFEST,
    bindingSources.map((bindingSource) => `${bindingSource.slug}/server.php`),
  );
  const hasEditorEnqueueHook = hasPhpFunctionCallWithStringArguments(
    source,
    'add_action',
    ['enqueue_block_editor_assets', enqueueFunctionName],
    { requirePhpOpenTag: true },
  );
  const hasEditorScript = enqueueFunction !== null &&
    hasPhpFunctionCallWithStringArgument(
      enqueueFunction.source,
      'plugins_url',
      WORKSPACE_BINDING_EDITOR_SCRIPT,
    );
  const hasEditorAsset = enqueueFunction !== null &&
    hasPhpLiteralDirectoryInclude(
      enqueueFunction.source,
      `/${WORKSPACE_BINDING_EDITOR_ASSET}`,
    );
  const hasEditorEnqueueCall = enqueueFunction !== null &&
    hasPhpFunctionCall(enqueueFunction.source, 'wp_enqueue_script');
  const hasValidBootstrap =
    hasServerManifest &&
    hasValidManifest &&
    hasEditorEnqueueHook &&
    hasEditorScript &&
    hasEditorAsset &&
    hasEditorEnqueueCall;

  return createDoctorCheck(
    'Binding bootstrap',
    hasValidBootstrap ? 'pass' : 'fail',
    hasValidBootstrap
      ? 'Binding source PHP manifest and editor bootstrap hooks are present'
      : 'Missing or stale binding source PHP manifest or editor enqueue hook',
  );
}

function checkWorkspaceBindingSourcesIndex(
	projectDir: string,
	bindingSources: WorkspaceInventory['bindingSources'],
): DoctorCheck {
  const indexRelativePath = [path.join('src', 'bindings', 'index.ts'), path.join('src', 'bindings', 'index.js')].find(
    (relativePath) => fs.existsSync(path.join(projectDir, relativePath)),
  );

  if (!indexRelativePath) {
    return createDoctorCheck(
      'Binding sources index',
      'fail',
      'Missing src/bindings/index.ts or src/bindings/index.js',
    );
  }

  const indexPath = path.join(projectDir, indexRelativePath);
  const source = fs.readFileSync(indexPath, 'utf8');
  const missingImports = bindingSources.filter(
    (bindingSource) => !source.includes(`./${bindingSource.slug}/editor`),
  );

  return createDoctorCheck(
    'Binding sources index',
    missingImports.length === 0 ? 'pass' : 'fail',
    missingImports.length === 0
      ? 'Binding source editor registrations are aggregated'
      : `Missing editor imports for: ${missingImports.map((entry) => entry.slug).join(', ')}`,
  );
}

function checkWorkspaceBindingTarget(
	projectDir: string,
	workspace: WorkspaceProject,
	registeredBlockSlugs: Set<string>,
	bindingSource: WorkspaceInventory['bindingSources'][number],
): DoctorCheck | undefined {
  const hasBlock = bindingSource.block !== undefined;
  const hasAttribute = bindingSource.attribute !== undefined;
  if (!hasBlock && !hasAttribute) {
    return undefined;
  }
  if (!bindingSource.block || !bindingSource.attribute) {
    return createDoctorCheck(
      `Binding target ${bindingSource.slug}`,
      'fail',
      'Binding target entries must include both block and attribute.',
    );
  }
  if (!registeredBlockSlugs.has(bindingSource.block)) {
    return createDoctorCheck(
      `Binding target ${bindingSource.slug}`,
      'fail',
      `Binding target references unknown block "${bindingSource.block}".`,
    );
  }

  const blockJsonRelativePath = path.join(
    'src',
    'blocks',
    bindingSource.block,
    'block.json',
  );
  const blockJsonPath = path.join(projectDir, blockJsonRelativePath);
  const issues: string[] = [];
  try {
    const blockJson = parseScaffoldBlockMetadata<Record<string, unknown> & { attributes?: unknown }>(
      readJsonFileSync(blockJsonPath, {
        context: 'workspace block metadata',
      }),
    );
    const attributes = blockJson.attributes;
    if (!attributes || typeof attributes !== 'object' || Array.isArray(
      attributes,
    )) {
      issues.push(`${blockJsonRelativePath} must define an attributes object`);
    } else {
      const attributeConfig = (attributes as Record<string, unknown>)[bindingSource.attribute];
      if (
				!attributeConfig ||
				typeof attributeConfig !== 'object' ||
				Array.isArray(attributeConfig)
			) {
        issues.push(
          `${blockJsonRelativePath} must declare attribute "${bindingSource.attribute}"`,
        );
      }
    }
  } catch (error) {
    issues.push(
      error instanceof Error
        ? `Unable to read ${blockJsonRelativePath}: ${error.message}`
        : `Unable to read ${blockJsonRelativePath}.`,
    );
  }

  const serverPath = path.join(projectDir, bindingSource.serverFile);
  if (fs.existsSync(serverPath)) {
    const serverSource = fs.readFileSync(serverPath, 'utf8');
    const supportedAttributesFilter = `block_bindings_supported_attributes_${workspace.workspace.namespace}/${bindingSource.block}`;
    if (!serverSource.includes(supportedAttributesFilter)) {
      issues.push(
        `${bindingSource.serverFile} must register ${supportedAttributesFilter}`,
      );
    }
    if (
			!new RegExp(`(['"])${escapeRegex(bindingSource.attribute)}\\1`, 'u').test(
        serverSource,
      )
		) {
      issues.push(
        `${bindingSource.serverFile} must expose attribute "${bindingSource.attribute}"`,
      );
    }
  } else {
    issues.push(`Missing ${bindingSource.serverFile}`);
  }

  const editorPath = path.join(projectDir, bindingSource.editorFile);
  if (fs.existsSync(editorPath)) {
    const editorSource = fs.readFileSync(editorPath, 'utf8');
    const blockName = `${workspace.workspace.namespace}/${bindingSource.block}`;
    const bindingSourceTargetMatch = editorSource.match(
      /export\s+const\s+BINDING_SOURCE_TARGET\s*=\s*\{([\s\S]*?)\}\s+as\s+const\s*;/u,
    );
    if (!bindingSourceTargetMatch) {
      issues.push(
        `${bindingSource.editorFile} must export BINDING_SOURCE_TARGET`,
      );
    } else {
      const targetSource = bindingSourceTargetMatch[1] ?? '';
      const attributePattern = new RegExp(
        `\\battribute\\s*:\\s*["']${escapeRegex(bindingSource.attribute)}["']`,
        'u',
      );
      const blockPattern = new RegExp(
        `\\bblock\\s*:\\s*["']${escapeRegex(blockName)}["']`,
        'u',
      );
      if (!attributePattern.test(targetSource)) {
        issues.push(
          `${bindingSource.editorFile} must document target attribute "${bindingSource.attribute}"`,
        );
      }
      if (!blockPattern.test(targetSource)) {
        issues.push(
          `${bindingSource.editorFile} must document target block "${blockName}"`,
        );
      }
    }
  } else {
    issues.push(`Missing ${bindingSource.editorFile}`);
  }

  return createDoctorCheck(
    `Binding target ${bindingSource.slug}`,
    issues.length === 0 ? 'pass' : 'fail',
    issues.length === 0
      ? `${bindingSource.block}.${bindingSource.attribute} is declared and supported`
      : issues.join('; '),
  );
}

function checkWorkspaceBindingPostMeta(
	projectDir: string,
	inventory: WorkspaceInventory,
	bindingSource: WorkspaceInventory['bindingSources'][number],
): DoctorCheck | undefined {
  if (!bindingSource.postMeta) {
    return undefined;
  }

  const postMeta = inventory.postMeta.find(
    (entry) => entry.slug === bindingSource.postMeta,
  );
  if (!postMeta) {
    return createDoctorCheck(
      `Binding post meta ${bindingSource.slug}`,
      'fail',
      `Binding source references unknown post meta contract "${bindingSource.postMeta}".`,
    );
  }

  const issues: string[] = [];
  try {
    const fields = loadPostMetaBindingFieldsSync(projectDir, postMeta);
    if (bindingSource.metaPath) {
      assertPostMetaBindingPath(fields, postMeta.slug, bindingSource.metaPath);
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  const serverPath = path.join(projectDir, bindingSource.serverFile);
  if (fs.existsSync(serverPath)) {
    const serverSource = fs.readFileSync(serverPath, 'utf8');
    if (!serverSource.includes('get_post_meta')) {
      issues.push(`${bindingSource.serverFile} must read post meta values`);
    }
    if (!serverSource.includes(postMeta.metaKey)) {
      issues.push(
        `${bindingSource.serverFile} must reference ${postMeta.metaKey}`,
      );
    }
    if (!serverSource.includes(postMeta.schemaFile)) {
      issues.push(
        `${bindingSource.serverFile} must reference ${postMeta.schemaFile}`,
      );
    }
  } else {
    issues.push(`Missing ${bindingSource.serverFile}`);
  }

  const editorPath = path.join(projectDir, bindingSource.editorFile);
  if (fs.existsSync(editorPath)) {
    const editorSource = fs.readFileSync(editorPath, 'utf8');
    if (!editorSource.includes('POST_META_BINDING_FIELDS')) {
      issues.push(
        `${bindingSource.editorFile} must define post meta binding fields`,
      );
    }
    if (!editorSource.includes(postMeta.schemaFile)) {
      issues.push(
        `${bindingSource.editorFile} must reference ${postMeta.schemaFile}`,
      );
    }
    if (bindingSource.metaPath && !editorSource.includes(
      bindingSource.metaPath,
    )) {
      issues.push(
        `${bindingSource.editorFile} must reference default meta path "${bindingSource.metaPath}"`,
      );
    }
  } else {
    issues.push(`Missing ${bindingSource.editorFile}`);
  }

  return createDoctorCheck(
    `Binding post meta ${bindingSource.slug}`,
    issues.length === 0 ? 'pass' : 'fail',
    issues.length === 0
      ? `${bindingSource.slug} reads ${postMeta.slug} via ${postMeta.schemaFile}`
      : issues.join('; '),
  );
}

/**
 * Collect workspace doctor checks for extracted binding-source diagnostics.
 *
 * @param workspace Resolved workspace metadata and filesystem paths.
 * @param inventory Parsed workspace inventory from `scripts/block-config.ts`.
 * @returns Ordered `DoctorCheck[]` rows for binding bootstrap, index, and target checks.
 */
export function getWorkspaceBindingDoctorChecks(
	workspace: WorkspaceProject,
	inventory: WorkspaceInventory,
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  if (inventory.bindingSources.length > 0) {
    checks.push(
      checkWorkspaceBindingBootstrap(
        workspace.projectDir,
        workspace.packageName,
        workspace.workspace.phpPrefix,
        inventory.bindingSources,
      ),
    );
    checks.push(
      checkWorkspaceBindingSourcesIndex(
        workspace.projectDir,
        inventory.bindingSources,
      ),
    );
  }

  const registeredBlockSlugs = new Set(
    inventory.blocks.map((block) => block.slug),
  );
  for (const bindingSource of inventory.bindingSources) {
    checks.push(
      checkExistingFiles(
        workspace.projectDir,
        `Binding source ${bindingSource.slug}`,
        [bindingSource.serverFile, bindingSource.editorFile],
      ),
    );
    const bindingTargetCheck = checkWorkspaceBindingTarget(
      workspace.projectDir,
      workspace,
      registeredBlockSlugs,
      bindingSource,
    );
    if (bindingTargetCheck) {
      checks.push(bindingTargetCheck);
    }
    const bindingPostMetaCheck = checkWorkspaceBindingPostMeta(
      workspace.projectDir,
      inventory,
      bindingSource,
    );
    if (bindingPostMetaCheck) {
      checks.push(bindingPostMetaCheck);
    }
  }

  return checks;
}
