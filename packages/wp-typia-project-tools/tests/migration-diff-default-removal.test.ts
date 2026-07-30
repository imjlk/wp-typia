import { afterAll, describe, expect, test } from 'bun:test';
import * as path from 'node:path';

import {
  cleanupMigrationTempRoot,
  createDefaultChangeProject,
  createMigrationTempRoot,
  createRemovalProject,
} from './helpers/migration-test-harness.js';
import { createMigrationDiff } from '../src/runtime/migration-diff.js';
import {
  createEmptyMigrationRiskSummary,
  createMigrationRiskSummary,
  formatMigrationRiskSummary,
} from '../src/runtime/migration-risk.js';
import { loadMigrationProject } from '../src/runtime/migration-project.js';
import {
  describeDefaultChange,
  hasDefaultChange,
} from '../src/runtime/migration/migration-diff-default.js';
import type { ManifestAttribute } from '@wp-typia/block-runtime/migration-types';

describe('wp-typia migrate diff default and removal classification', () => {
  const tempRoot = createMigrationTempRoot('wp-typia-migration-default-removal-');

  afterAll(() => {
    cleanupMigrationTempRoot(tempRoot);
  });

  describe('default-change diff kind', () => {
    test('emits a default-change outcome when the default value changes between versions', () => {
      const projectDir = path.join(tempRoot, 'default-change-project');
      createDefaultChangeProject(projectDir);

      const diff = createMigrationDiff(
        loadMigrationProject(projectDir),
        'v1',
        'v3',
      );

      const defaultChangeItem = diff.summary.autoItems.find(
        (item) => item.kind === 'default-change',
      );
      expect(defaultChangeItem).toBeDefined();
      expect(defaultChangeItem?.path).toBe('label');
      expect(defaultChangeItem?.detail).toContain('Original');
      expect(defaultChangeItem?.detail).toContain('Updated');
    });

    test('classifies default-change in the additive risk bucket', () => {
      const projectDir = path.join(tempRoot, 'default-change-risk-project');
      createDefaultChangeProject(projectDir);

      const summary = createMigrationRiskSummary(
        createMigrationDiff(loadMigrationProject(projectDir), 'v1', 'v3'),
      );

      expect(summary.additive.count).toBeGreaterThan(0);
      expect(summary.additive.items.some((item) => item.includes('default-change'))).toBe(true);
    });
  });

  describe('removal risk bucket', () => {
    test('separates attribute removal from the additive bucket', () => {
      const projectDir = path.join(tempRoot, 'removal-project');
      createRemovalProject(projectDir);

      const diff = createMigrationDiff(
        loadMigrationProject(projectDir),
        'v1',
        'v3',
      );

      const dropItem = diff.summary.autoItems.find(
        (item) => item.kind === 'drop',
      );
      expect(dropItem).toBeDefined();
      expect(dropItem?.path).toBe('title');
    });

    test('classifies drop outcomes in the removal bucket, not additive', () => {
      const projectDir = path.join(tempRoot, 'removal-risk-project');
      createRemovalProject(projectDir);

      const summary = createMigrationRiskSummary(
        createMigrationDiff(loadMigrationProject(projectDir), 'v1', 'v3'),
      );

      expect(summary.removal.count).toBeGreaterThan(0);
      expect(summary.removal.items.some((item) => item.includes('drop'))).toBe(true);
      expect(summary.additive.items.some((item) => item.includes('drop'))).toBe(false);
    });
  });

  describe('risk summary shape', () => {
    test('empty risk summary includes the removal bucket', () => {
      const empty = createEmptyMigrationRiskSummary();
      expect(empty).toHaveProperty('removal');
      expect(empty.removal.count).toBe(0);
      expect(empty.removal.items).toEqual([]);
    });

    test('formatMigrationRiskSummary includes removal count', () => {
      const empty = createEmptyMigrationRiskSummary();
      const formatted = formatMigrationRiskSummary(empty);
      expect(formatted).toContain('removal=0');
    });
  });

  describe('hasDefaultChange and describeDefaultChange unit logic', () => {
    function makeAttr(
      overrides: { defaultValue?: unknown; hasDefault?: boolean } = {},
    ): ManifestAttribute {
      const hasDefault = overrides.hasDefault ?? false;
      const defaultValue = overrides.defaultValue ?? null;
      return {
        typia: {
          constraints: {
            exclusiveMaximum: null,
            exclusiveMinimum: null,
            format: null,
            maxLength: null,
            maxItems: null,
            maximum: null,
            minLength: null,
            minItems: null,
            minimum: null,
            multipleOf: null,
            pattern: null,
            typeTag: null,
          },
          defaultValue: defaultValue as ManifestAttribute['typia']['defaultValue'],
          hasDefault,
        },
        ts: {
          items: null,
          kind: 'string',
          properties: null,
          required: false,
          union: null,
        },
        wp: {
          defaultValue: null,
          enum: null,
          hasDefault: false,
          type: 'string',
        },
      };
    }

    test('returns false when neither side has a default', () => {
      expect(hasDefaultChange(makeAttr(), makeAttr())).toBe(false);
    });

    test('returns true when a default is added', () => {
      expect(
        hasDefaultChange(
          makeAttr(),
          makeAttr({ hasDefault: true, defaultValue: 'new' }),
        ),
      ).toBe(true);
    });

    test('returns true when a default is removed', () => {
      expect(
        hasDefaultChange(
          makeAttr({ hasDefault: true, defaultValue: 'old' }),
          makeAttr(),
        ),
      ).toBe(true);
    });

    test('returns true when the default value changes', () => {
      expect(
        hasDefaultChange(
          makeAttr({ hasDefault: true, defaultValue: 'old' }),
          makeAttr({ hasDefault: true, defaultValue: 'new' }),
        ),
      ).toBe(true);
    });

    test('returns false when the default value is identical', () => {
      expect(
        hasDefaultChange(
          makeAttr({ hasDefault: true, defaultValue: 'same' }),
          makeAttr({ hasDefault: true, defaultValue: 'same' }),
        ),
      ).toBe(false);
    });

    test('describeDefaultChange returns default unchanged when neither has a default', () => {
      expect(describeDefaultChange(makeAttr(), makeAttr())).toBe(
        'default unchanged',
      );
    });

    test('describeDefaultChange formats an added default', () => {
      const detail = describeDefaultChange(
        makeAttr(),
        makeAttr({ hasDefault: true, defaultValue: 'new' }),
      );
      expect(detail).toContain('default added');
      expect(detail).toContain('"new"');
    });

    test('describeDefaultChange formats a removed default', () => {
      const detail = describeDefaultChange(
        makeAttr({ hasDefault: true, defaultValue: 'old' }),
        makeAttr(),
      );
      expect(detail).toContain('default removed');
      expect(detail).toContain('"old"');
    });
  });
});
