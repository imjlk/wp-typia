import type {
  DiffOutcome,
  MigrationDiff,
  MigrationRiskBucket,
  MigrationRiskSummary,
  RenameCandidate,
  TransformSuggestion,
} from './migration-types.js';

function createRiskBucket(items: string[]): MigrationRiskBucket {
  return {
    count: items.length,
    items,
  };
}

function formatDiffOutcome(item: DiffOutcome): string {
  return `${item.path}: ${item.kind}${item.detail ? ` (${item.detail})` : ''}`;
}

function formatRenameCandidate(candidate: RenameCandidate): string {
  return `${candidate.currentPath} <- ${candidate.legacyPath} (${candidate.autoApply ? 'auto' : 'review'}, ${candidate.reason})`;
}

function formatTransformSuggestion(suggestion: TransformSuggestion): string {
  return `${suggestion.currentPath}${suggestion.legacyPath ? ` <- ${suggestion.legacyPath}` : ''} (${suggestion.reason})`;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

/**
 * Create a risk summary with every bucket initialized to zero items.
 *
 * The five buckets are: `additive` (additions, hydrations, default-value
 * changes), `removal` (attribute drops), `rename` (detected renames),
 * `semanticTransform` (coercion suggestions), and `unionBreaking`
 * (discriminated-union branch removals or discriminator changes).
 *
 * @returns A risk summary whose buckets all carry empty item lists.
 */
export function createEmptyMigrationRiskSummary(): MigrationRiskSummary {
  return {
    additive: createRiskBucket([]),
    removal: createRiskBucket([]),
    rename: createRiskBucket([]),
    semanticTransform: createRiskBucket([]),
    unionBreaking: createRiskBucket([]),
  };
}

/**
 * Format a risk summary into a single-line human-readable string.
 *
 * @param summary Risk summary to format.
 * @returns A comma-separated string with per-bucket counts, including
 *   `removal` (attribute drops) distinguished from `additive`.
 */
export function formatMigrationRiskSummary(summary: MigrationRiskSummary): string {
  return `additive=${summary.additive.count}, removal=${summary.removal.count}, rename=${summary.rename.count}, semanticTransform=${summary.semanticTransform.count}, unionBreaking=${summary.unionBreaking.count}`;
}

/**
 * Classify a migration diff into five risk buckets.
 *
 * `additive` collects low-risk auto outcomes (add-default, add-optional,
 * default-change, hydrate, union-branch-addition). `removal` collects
 * attribute drops (`drop` kind) separately so data-loss edges are not hidden
 * inside additive. `rename`, `semanticTransform`, and `unionBreaking` capture
 * their respective diff categories.
 *
 * @param diff Migration diff whose summary items are classified.
 * @returns A risk summary with deduplicated items per bucket.
 */
export function createMigrationRiskSummary(diff: MigrationDiff): MigrationRiskSummary {
  const additiveKinds = new Set([
    'add-default',
    'add-optional',
    'default-change',
    'hydrate',
    'union-branch-addition',
  ]);

  const additiveItems = unique(
    diff.summary.autoItems
      .filter((item) => additiveKinds.has(item.kind))
      .map(formatDiffOutcome),
  );
  const removalItems = unique(
    diff.summary.autoItems
      .filter((item) => item.kind === 'drop')
      .map(formatDiffOutcome),
  );
  const renameItems = unique(
    diff.summary.renameCandidates.map(formatRenameCandidate),
  );
  const semanticTransformItems = unique(
    diff.summary.transformSuggestions.map(formatTransformSuggestion),
  );
  const unionBreakingItems = unique(
    diff.summary.manualItems
      .filter((item) => item.kind.startsWith('union-'))
      .map(formatDiffOutcome),
  );

  return {
    additive: createRiskBucket(additiveItems),
    removal: createRiskBucket(removalItems),
    rename: createRiskBucket(renameItems),
    semanticTransform: createRiskBucket(semanticTransformItems),
    unionBreaking: createRiskBucket(unionBreakingItems),
  };
}
