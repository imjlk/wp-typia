import type { MigrationRiskSummary } from './helpers';

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
  after: Record< string, unknown > | null;
  before: Record< string, unknown >;
  changedFields: string[];
  unresolved: string[];
  unionBranches: UnionBranchPreview[];
  validationErrors: string[];
}

export interface BlockScanResult {
  analysis: MigrationAnalysis;
  attributes: Record< string, unknown >;
  blockName: string;
  blockPath: number[];
  postId: number;
  postTitle: string;
  postType: string;
  preview: MigrationPreview;
  rawContent: string;
  restBase: string;
}

export interface BatchMigrationBlockResult {
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
  errors: Array< { postId: number; reason: string } >;
  failed: number;
  posts: BatchMigrationPostResult[];
  successful: number;
  total: number;
}

/**
 * Creates an empty migration risk summary without sharing mutable arrays.
 */
export function createEmptyRiskSummary(): MigrationRiskSummary {
  return {
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
}
