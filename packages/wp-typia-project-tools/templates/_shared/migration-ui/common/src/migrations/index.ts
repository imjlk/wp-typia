import apiFetch from '@wordpress/api-fetch';
import { parse, serialize } from '@wordpress/blocks';
import type { BlockInstance } from '@wp-typia/block-types/blocks/registration';
import { parseManifestDocument } from '@wp-typia/block-runtime/editor';
import typia from 'typia';

import migrationBlocks from './generated';
import {
  type ManifestAttribute,
  type ManifestDocument,
  type MigrationRiskSummary,
  manifestMatchesDocument,
  summarizeVersionDelta,
} from './helpers';

export interface MigrationAnalysis {
  needsMigration: boolean;
  currentMigrationVersion: string;
  targetMigrationVersion: string;
  confidence: number;
  reasons: string[];
  riskSummary: MigrationRiskSummary;
  warnings: string[];
  affectedFields: {
    added: string[];
    changed: string[];
    removed: string[];
  };
}

export interface UnionBranchPreview {
  field: string;
  legacyBranch: string | null;
  nextBranch: string | null;
  status: 'auto' | 'current' | 'manual' | 'unknown';
}

export interface MigrationPreview {
  after: Record<string, unknown> | null;
  before: Record<string, unknown>;
  changedFields: string[];
  unresolved: string[];
  unionBranches: UnionBranchPreview[];
  validationErrors: string[];
}

export interface BlockScanResult {
  analysis: MigrationAnalysis;
  attributes: Record<string, unknown>;
  blockName: string;
  blockPath: number[];
  postId: number;
  postTitle: string;
  postType: string;
  preview: MigrationPreview;
  rawContent: string;
  restBase: string;
  targetKey: string;
}

export interface BatchMigrationBlockResult {
  blockName: string;
  blockPath: number[];
  currentMigrationVersion: string;
  preview: MigrationPreview;
  reason?: string;
  status: 'failed' | 'success';
  targetMigrationVersion: string;
}

export interface BatchMigrationPostResult {
  postId: number;
  postTitle: string;
  postType: string;
  previews: BatchMigrationBlockResult[];
  reason?: string;
  status: 'failed' | 'success';
}

export interface BatchMigrationResult {
  errors: Array<{ postId: number; reason: string }>;
  failed: number;
  posts: BatchMigrationPostResult[];
  successful: number;
  total: number;
}

interface GroupedScanResult {
  postId: number;
  postTitle: string;
  postType: string;
  rawContent: string;
  restBase: string;
  results: BlockScanResult[];
}

interface EditablePostUpdateRequest {
  content: string;
}

type ParsedBlock = BlockInstance<Record<string, unknown>>;

interface EditablePostType {
  rest_base: string;
  slug: string;
}

interface EditablePostRecord {
  content?: {
    raw?: string;
  };
  id: number;
  title?: {
    rendered?: string;
  };
}

interface GeneratedMigrationRegistry {
  currentManifest: ManifestDocument;
  currentMigrationVersion: string;
  entries: Array<{
    fromMigrationVersion: string;
    manifest: ManifestDocument;
    riskSummary: MigrationRiskSummary;
    rule: {
      migrate(input: Record<string, unknown>): unknown;
      unresolved?: readonly string[];
    };
  }>;
}

interface MigrationTargetRuntime {
  blockName: string;
  deprecated: readonly unknown[];
  key: string;
  legacyMigrationVersions: readonly string[];
  registry: GeneratedMigrationRegistry;
  validators: {
    validate(attributes: unknown): {
      errors?: Array<{ expected?: string; path?: string }>;
      isValid: boolean;
    };
  };
}

interface MigrationResolution {
  analysis: MigrationAnalysis;
  preview: MigrationPreview;
}

const manifestDocumentCache = new WeakMap<object, ManifestDocument>();

function parseCachedManifestDocument(manifest: unknown): ManifestDocument {
  if (typeof manifest !== 'object' || manifest === null) {
    return parseManifestDocument<ManifestDocument>(manifest);
  }

  const cached = manifestDocumentCache.get(manifest);
  if (cached) {
    return cached;
  }

  const parsed = parseManifestDocument<ManifestDocument>(manifest);
  manifestDocumentCache.set(manifest, parsed);
  return parsed;
}

function getCurrentManifestDocument(
  target: MigrationTargetRuntime,
): ManifestDocument {
  return parseCachedManifestDocument(target.registry.currentManifest);
}

function getLegacyManifestDocument(
  target: MigrationTargetRuntime,
  entry: MigrationTargetRuntime['registry']['entries'][number],
): ManifestDocument {
  return parseCachedManifestDocument(entry.manifest);
}

const EMPTY_RISK_SUMMARY: MigrationRiskSummary = {
  additive: {
    count: 0,
    items: [],
  },
  removal: {
    count: 0,
    items: [],
  },
  rename: {
    count: 0,
    items: [],
  },
  semanticTransform: {
    count: 0,
    items: [],
  },
  unionBreaking: {
    count: 0,
    items: [],
  },
};

const targets = migrationBlocks as readonly MigrationTargetRuntime[];

function formatRiskSummary(riskSummary: MigrationRiskSummary): string {
  return `additive ${riskSummary.additive.count}, removal ${riskSummary.removal.count}, rename ${riskSummary.rename.count}, transform ${riskSummary.semanticTransform.count}, union breaking ${riskSummary.unionBreaking.count}`;
}

function getTargetByBlockName(
  blockName: string,
): MigrationTargetRuntime | undefined {
  return targets.find((target) => target.blockName === blockName);
}

export function detectBlockMigration(
  blockName: string,
  attributes: Record<string, unknown>,
): MigrationAnalysis {
  const target = getTargetByBlockName(blockName);
  if (!target) {
    throw new Error(`Unsupported migration block: ${blockName}`);
  }

  return resolveMigrationState(target, attributes).analysis;
}

export function autoMigrateBlock(
  blockName: string,
  attributes: Record<string, unknown>,
) {
  const target = getTargetByBlockName(blockName);
  if (!target) {
    throw new Error(`Unsupported migration block: ${blockName}`);
  }

  const resolution = resolveMigrationState(target, attributes);
  if (!resolution.preview.after) {
    throw new Error(
      resolution.preview.validationErrors[0] ??
        resolution.preview.unresolved[0] ??
        `Unable to migrate block attributes for ${blockName}.`,
    );
  }

  return resolution.preview.after;
}

export async function scanSiteForMigrations(
  blockNames: readonly string[] = targets.map((target) => target.blockName),
): Promise<BlockScanResult[]> {
  const allowedBlockNames = new Set(blockNames);
  const postTypes = await fetchEditablePostTypes();
  const results: BlockScanResult[] = [];

  for (const postType of postTypes) {
    const posts = await fetchAllPosts(postType.rest_base);
    for (const post of posts) {
      const content = post?.content?.raw;
      if (typeof content !== 'string' || content.length === 0) {
        continue;
      }

      const blocks = parse(content);
      walkBlocks(blocks, [], (block, blockPath) => {
        if (!block.name || !allowedBlockNames.has(block.name)) {
          return;
        }

        const target = getTargetByBlockName(block.name);
        if (!target) {
          return;
        }

        const attributes = (block.attributes ?? {}) as Record<string, unknown>;
        const resolution = resolveMigrationState(target, attributes);

        if (
          resolution.analysis.needsMigration ||
          resolution.preview.changedFields.length > 0 ||
          resolution.preview.unresolved.length > 0 ||
          resolution.preview.validationErrors.length > 0
        ) {
          results.push({
            analysis: resolution.analysis,
            attributes,
            blockName: block.name,
            blockPath,
            postId: post.id,
            postTitle: post?.title?.rendered ?? `Post ${post.id}`,
            postType: postType.slug,
            preview: resolution.preview,
            rawContent: content,
            restBase: postType.rest_base,
            targetKey: target.key,
          });
        }
      });
    }
  }

  return results;
}

export async function batchMigrateScanResults(
  results: BlockScanResult[],
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<BatchMigrationResult> {
  const grouped = groupResultsByPost(results);
  const summary: BatchMigrationResult = {
    errors: [],
    failed: 0,
    posts: [],
    successful: 0,
    total: Object.keys(grouped).length,
  };

  for (const group of Object.values(grouped)) {
    const blockPreviews = group.results.map((result) => {
      const target = getTargetByBlockName(result.blockName);
      if (!target) {
        return {
          blockName: result.blockName,
          blockPath: result.blockPath,
          currentMigrationVersion: 'unknown',
          preview: result.preview,
          reason: `Unsupported migration block: ${result.blockName}`,
          status: 'failed',
          targetMigrationVersion: 'unknown',
        } satisfies BatchMigrationBlockResult;
      }
      const resolution = resolveMigrationState(target, result.attributes);
      const reason =
        resolution.preview.validationErrors[0] ??
        resolution.preview.unresolved[0] ??
        undefined;
      const status =
        resolution.preview.after &&
        resolution.preview.unresolved.length === 0 &&
        resolution.preview.validationErrors.length === 0
          ? 'success'
          : 'failed';

      return {
        blockName: result.blockName,
        blockPath: result.blockPath,
        currentMigrationVersion: resolution.analysis.currentMigrationVersion,
        preview: resolution.preview,
        reason,
        status,
        targetMigrationVersion: resolution.analysis.targetMigrationVersion,
      } satisfies BatchMigrationBlockResult;
    });

    const failedPreview = blockPreviews.find(
      (preview) => preview.status === 'failed',
    );
    if (failedPreview) {
      summary.failed += 1;
      summary.errors.push({
        postId: group.postId,
        reason:
          failedPreview.reason ?? 'One or more blocks could not be migrated.',
      });
      summary.posts.push({
        postId: group.postId,
        postTitle: group.postTitle,
        postType: group.postType,
        previews: blockPreviews,
        reason: failedPreview.reason,
        status: 'failed',
      });
      continue;
    }

    const migratedContent = migratePostContent(blockPreviews, group.rawContent);
    if (!dryRun) {
      const latestPost = await fetchPostById(group.restBase, group.postId);
      const latestContent = latestPost.content?.raw;
      if (
        typeof latestContent !== 'string' ||
        latestContent !== group.rawContent
      ) {
        summary.failed += 1;
        summary.errors.push({
          postId: group.postId,
          reason:
            'Post content changed after the scan. Re-run the migration scan before writing.',
        });
        summary.posts.push({
          postId: group.postId,
          postTitle: group.postTitle,
          postType: group.postType,
          previews: blockPreviews,
          reason:
            'Post content changed after the scan. Re-run the migration scan before writing.',
          status: 'failed',
        });
        continue;
      }

      await apiFetch({
        body: typia.json.assertStringify<EditablePostUpdateRequest>({
          content: migratedContent,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
        path: `/wp/v2/${group.restBase}/${group.postId}`,
      });
    }

    summary.successful += 1;
    summary.posts.push({
      postId: group.postId,
      postTitle: group.postTitle,
      postType: group.postType,
      previews: blockPreviews,
      status: 'success',
    });
  }

  return summary;
}

export function generateMigrationReport(
  scanResults: BlockScanResult[],
): string {
  let report = '# Migration Report\n\n';
  report += `- Supported block targets: ${targets.length}\n`;
  report += `- Supported deprecated entries: ${targets.reduce((total, target) => total + target.deprecated.length, 0)}\n`;
  report += `- Scan results needing attention: ${scanResults.length}\n\n`;

  for (const entry of scanResults) {
    report += `## ${entry.postTitle} (#${entry.postId})\n`;
    report += `- Block: ${entry.blockName}\n`;
    report += `- Migration version: ${entry.analysis.currentMigrationVersion} -> ${entry.analysis.targetMigrationVersion}\n`;
    report += `- Confidence: ${entry.analysis.confidence}\n`;
    report += `- Risk summary: ${formatRiskSummary(
      entry.analysis.riskSummary,
    )}\n`;
    if (entry.preview.changedFields.length > 0) {
      report += `- Changed fields: ${entry.preview.changedFields.join(', ')}\n`;
    }
    if (entry.preview.unionBranches.length > 0) {
      report += `- Union branches:\n`;
      for (const branch of entry.preview.unionBranches) {
        report += `  - ${branch.field}: ${
          branch.legacyBranch ?? 'unknown'
        } -> ${branch.nextBranch ?? 'unknown'} (${branch.status})\n`;
      }
    }
    if (entry.preview.unresolved.length > 0) {
      report += `- Unresolved: ${entry.preview.unresolved.join(', ')}\n`;
    }
    if (entry.preview.validationErrors.length > 0) {
      report += `- Validation errors: ${entry.preview.validationErrors.join(
        ', ',
      )}\n`;
    }
    report += '\n### Before\n\n```json\n';
    report += `${JSON.stringify(entry.preview.before, null, 2)}\n`;
    report += '```\n\n';
    report += '### After\n\n```json\n';
    report += `${JSON.stringify(entry.preview.after, null, 2)}\n`;
    report += '```\n\n';
  }

  return report;
}

export const migrationUtils = {
  getStats() {
    return {
      targets: targets.map((target) => ({
        blockName: target.blockName,
        currentMigrationVersion: target.registry.currentMigrationVersion,
        deprecatedEntries: target.deprecated.length,
        key: target.key,
        legacyMigrationVersions: target.legacyMigrationVersions,
        supportedMigrationVersions: [
          ...target.legacyMigrationVersions,
          target.registry.currentMigrationVersion,
        ],
      })),
    };
  },
  testMigration(
    blockName: string,
    attributes: Record<string, unknown>,
  ): Record<string, unknown> {
    return autoMigrateBlock(blockName, attributes);
  },
};

async function fetchEditablePostTypes(): Promise<EditablePostType[]> {
  const result = (await apiFetch({
    path: '/wp/v2/types?context=edit',
  })) as Record<
    string,
    { rest_base?: string; slug?: string; viewable?: boolean }
  >;

  return Object.values(result)
    .filter((postType) => postType?.viewable && postType?.rest_base)
    .map((postType) => ({
      rest_base: postType.rest_base!,
      slug: postType.slug!,
    }));
}

async function fetchAllPosts(restBase: string): Promise<EditablePostRecord[]> {
  let page = 1;
  const entries: EditablePostRecord[] = [];

  while (true) {
    const result = (await apiFetch({
      parse: false,
      path: `/wp/v2/${restBase}?context=edit&per_page=100&page=${page}`,
    })) as Response;
    const pageEntries = (await result.json()) as EditablePostRecord[];
    entries.push(...pageEntries);
    const totalPages = Number.parseInt(
      result.headers.get('X-WP-TotalPages') ?? '1',
      10,
    );
    page += 1;
    if (page > totalPages) {
      break;
    }
  }

  return entries;
}

async function fetchPostById(
  restBase: string,
  postId: number,
): Promise<EditablePostRecord> {
  return (await apiFetch({
    path: `/wp/v2/${restBase}/${postId}?context=edit`,
  })) as EditablePostRecord;
}

function walkBlocks(
  blocks: ParsedBlock[],
  pathPrefix: number[],
  visitor: (block: ParsedBlock, path: number[]) => void,
): void {
  blocks.forEach((block, index) => {
    const blockPath = [...pathPrefix, index];
    visitor(block, blockPath);
    if (Array.isArray(block.innerBlocks) && block.innerBlocks.length > 0) {
      walkBlocks(block.innerBlocks, blockPath, visitor);
    }
  });
}

function groupResultsByPost(
  results: BlockScanResult[],
): Record<string, GroupedScanResult> {
  return results.reduce<Record<string, GroupedScanResult>>(
    (accumulator, result) => {
      const key = `${result.restBase}:${result.postId}`;
      if (!accumulator[key]) {
        accumulator[key] = {
          postId: result.postId,
          postTitle: result.postTitle,
          postType: result.postType,
          rawContent: result.rawContent,
          restBase: result.restBase,
          results: [],
        };
      }
      accumulator[key].results.push(result);
      return accumulator;
    },
    {},
  );
}

function migratePostContent(
  results: BatchMigrationBlockResult[],
  rawContent: string,
): string {
  const replacements = new Map(
    results
      .filter((result) => result.preview.after)
      .map((result) => [
        result.blockPath.join('.'),
        result.preview.after as Record<string, unknown>,
      ]),
  );
  const blocks = parse(rawContent) as ParsedBlock[];
  const nextBlocks = replaceBlocks(blocks, [], replacements);
  return serialize(nextBlocks);
}

function replaceBlocks(
  blocks: ParsedBlock[],
  pathPrefix: number[],
  replacements: Map<string, Record<string, unknown>>,
): ParsedBlock[] {
  return blocks.map((block, index) => {
    const blockPath = [...pathPrefix, index];
    const replacement = replacements.get(blockPath.join('.'));
    const innerBlocks = Array.isArray(block.innerBlocks)
      ? replaceBlocks(block.innerBlocks, blockPath, replacements)
      : [];

    if (!replacement) {
      return {
        ...block,
        innerBlocks,
      };
    }

    return {
      ...block,
      attributes: replacement,
      innerBlocks,
    };
  });
}

function resolveMigrationState(
  target: MigrationTargetRuntime,
  attributes: Record<string, unknown>,
): MigrationResolution {
  const currentValidation = target.validators.validate(attributes as any);
  if (currentValidation.isValid) {
    return {
      analysis: {
        affectedFields: {
          added: [],
          changed: [],
          removed: [],
        },
        confidence: 1,
        currentMigrationVersion: target.registry.currentMigrationVersion,
        needsMigration: false,
        reasons: ['Current Typia validator accepted the attributes.'],
        riskSummary: EMPTY_RISK_SUMMARY,
        targetMigrationVersion: target.registry.currentMigrationVersion,
        warnings: [],
      } satisfies MigrationAnalysis,
      preview: createPreview({
        after: attributes,
        before: attributes,
        currentManifest: getCurrentManifestDocument(target),
        legacyManifest: null,
        status: 'current',
        unresolved: [],
        validationErrors: [],
      }),
    };
  }

  for (const entry of target.registry.entries) {
    if (
      manifestMatchesDocument(
        getLegacyManifestDocument(target, entry),
        attributes,
      )
    ) {
      const migrated = entry.rule.migrate(attributes);
      const migratedValidation = target.validators.validate(migrated as any);
      const unresolved = Array.isArray(entry.rule.unresolved)
        ? [...entry.rule.unresolved]
        : [];
      const validationErrors = migratedValidation.isValid
        ? []
        : formatValidationErrors(migratedValidation.errors);
      let status: 'auto' | 'manual' = 'manual';
      if (migratedValidation.isValid && unresolved.length === 0) {
        status = 'auto';
      }
      const preview = createPreview({
        after: migratedValidation.isValid
          ? (migrated as unknown as Record<string, unknown>)
          : null,
        before: attributes,
        currentManifest: getCurrentManifestDocument(target),
        legacyManifest: getLegacyManifestDocument(target, entry),
        status,
        unresolved,
        validationErrors,
      });
      const delta = summarizeVersionDelta(
        getLegacyManifestDocument(target, entry),
        getCurrentManifestDocument(target),
      );

      return {
        analysis: {
          affectedFields: delta,
          confidence: unresolved.length > 0 ? 0.8 : 0.95,
          currentMigrationVersion: entry.fromMigrationVersion,
          needsMigration: true,
          reasons: [
            `Snapshot ${entry.fromMigrationVersion} matched this block.`,
            ...preview.unionBranches.map(
              (branch) =>
                `Union ${branch.field}: ${
                  branch.legacyBranch ?? 'unknown'
                } -> ${branch.nextBranch ?? 'unknown'} (${branch.status})`,
            ),
          ],
          riskSummary: entry.riskSummary ?? EMPTY_RISK_SUMMARY,
          targetMigrationVersion: target.registry.currentMigrationVersion,
          warnings: [...unresolved, ...validationErrors],
        } satisfies MigrationAnalysis,
        preview,
      };
    }
  }

  return {
    analysis: {
      affectedFields: {
        added: [],
        changed: [],
        removed: [],
      },
      confidence: 0.2,
      currentMigrationVersion: 'unknown',
      needsMigration: true,
      reasons: [
        'No legacy snapshot matched and current Typia validator rejected the attributes.',
      ],
      riskSummary: EMPTY_RISK_SUMMARY,
      targetMigrationVersion: target.registry.currentMigrationVersion,
      warnings: formatValidationErrors(currentValidation.errors),
    } satisfies MigrationAnalysis,
    preview: createPreview({
      after: null,
      before: attributes,
      currentManifest: getCurrentManifestDocument(target),
      legacyManifest: null,
      status: 'unknown',
      unresolved: [
        'Manual migration review is required because the block does not match any supported snapshot.',
      ],
      validationErrors: formatValidationErrors(currentValidation.errors),
    }),
  };
}

function createPreview({
  after,
  before,
  currentManifest,
  legacyManifest,
  status,
  unresolved,
  validationErrors,
}: {
  after: Record<string, unknown> | null;
  before: Record<string, unknown>;
  currentManifest: ManifestDocument;
  legacyManifest: ManifestDocument | null;
  status: UnionBranchPreview['status'];
  unresolved: string[];
  validationErrors: string[];
}): MigrationPreview {
  return {
    after,
    before,
    changedFields: after ? collectChangedFieldPaths(before, after) : [],
    unresolved,
    unionBranches: collectUnionBranchPreview(
      legacyManifest,
      currentManifest,
      before,
      after,
      status,
    ),
    validationErrors,
  };
}

function collectChangedFieldPaths(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix = '',
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: string[] = [];

  for (const key of keys) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    const left = before[key];
    const right = after[key];

    if (isPlainObject(left) && isPlainObject(right)) {
      changes.push(...collectChangedFieldPaths(left, right, nextPrefix));
      continue;
    }
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      changes.push(nextPrefix);
    }
  }

  return changes;
}

function collectUnionBranchPreview(
  legacyManifest: ManifestDocument | null,
  currentManifest: ManifestDocument,
  before: Record<string, unknown>,
  after: Record<string, unknown> | null,
  status: UnionBranchPreview['status'],
): UnionBranchPreview[] {
  const fieldNames = new Set<string>();

  for (const [field, attribute] of Object.entries(
    legacyManifest?.attributes ?? {},
  )) {
    if (attribute.ts.kind === 'union') {
      fieldNames.add(field);
    }
  }
  for (const [field, attribute] of Object.entries(
    currentManifest.attributes ?? {},
  )) {
    if (attribute.ts.kind === 'union') {
      fieldNames.add(field);
    }
  }

  return [...fieldNames].map((field) => {
    const legacyAttribute = legacyManifest?.attributes?.[field] ?? null;
    const currentAttribute = currentManifest.attributes?.[field] ?? null;
    return {
      field,
      legacyBranch: resolveUnionBranchKey(legacyAttribute, before[field]),
      nextBranch: resolveUnionBranchKey(
        currentAttribute,
        (after ?? before)[field],
      ),
      status,
    };
  });
}

function resolveUnionBranchKey(
  attribute: ManifestAttribute | null,
  value: unknown,
): string | null {
  if (
    !attribute ||
    attribute.ts.kind !== 'union' ||
    !attribute.ts.union
  ) {
    return null;
  }
  if (!isPlainObject(value)) {
    return null;
  }

  const discriminatorValue = value[attribute.ts.union.discriminator];
  if (typeof discriminatorValue !== 'string') {
    return null;
  }

  return discriminatorValue in attribute.ts.union.branches
    ? discriminatorValue
    : null;
}

function formatValidationErrors(
  errors: Array<{ expected?: string; path?: string }> = [],
): string[] {
  return errors.map((error) => {
    const pathLabel = error.path ?? '$';
    const expectedLabel = error.expected ?? 'unknown';
    return `${pathLabel}: ${expectedLabel}`;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
