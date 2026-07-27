import { describe, expect, test } from 'bun:test';

import {
  getDiagnosticSeverity,
  handleDiagnostics,
} from '../src/blocks/shared/diagnostics';
import {
  isNonArrayObject,
  isObjectRecord,
} from '../src/blocks/shared/object-utils';
import { normalizeStaticRegistrationValue } from '../src/blocks/shared/static-registration';

describe('shared block API helper utilities', () => {
  test('identifies object records without accepting arrays or null', () => {
    expect(isNonArrayObject({ enabled: true })).toBe(true);
    expect(isNonArrayObject(new Date())).toBe(true);
    expect(isNonArrayObject([])).toBe(false);
    expect(isObjectRecord({ enabled: true })).toBe(true);
    expect(isObjectRecord(Object.create(null))).toBe(true);
    expect(isObjectRecord([])).toBe(false);
    expect(isObjectRecord(null)).toBe(false);
    expect(isObjectRecord(new Date())).toBe(false);
    expect(isObjectRecord(new Map())).toBe(false);
    expect(isObjectRecord(new (class TestObject {})())).toBe(false);
  });

  test('maps strict mode to authoring diagnostic severity', () => {
    expect(getDiagnosticSeverity(true)).toBe('error');
    expect(getDiagnosticSeverity(false)).toBe('warning');
  });

  test('normalizes nested static registration values and omits undefined fields', () => {
    expect(
      normalizeStaticRegistrationValue(
        {
          enabled: true,
          nested: [
            {
              label: 'Field',
              omitted: undefined,
            },
          ],
          omitted: undefined,
        },
        'entry',
        { description: 'test' },
      ),
    ).toEqual({
      enabled: true,
      nested: [
        {
          label: 'Field',
        },
      ],
    });
  });

  test('rejects unsupported static registration values with contextual paths', () => {
    expect(() =>
      normalizeStaticRegistrationValue(
        {
          nested: {
            callback: () => undefined,
          },
        },
        'entry',
        { description: 'test' },
      ),
    ).toThrow(
      'Cannot generate static test registration code for function value at entry.nested.callback.',
    );
    expect(() =>
      normalizeStaticRegistrationValue(
        {
          createdAt: new Date('2026-05-16T00:00:00.000Z'),
        },
        'entry',
        { description: 'test' },
      ),
    ).toThrow(
      'Cannot generate static test registration code for unsupported value at entry.createdAt.',
    );
  });

  test('emits warning diagnostics through callbacks and throws grouped errors', () => {
    const warnings: Array<{ readonly message: string; readonly severity: 'warning' }> =
      [];

    handleDiagnostics(
      [
        {
          message: 'Use a newer WordPress feature.',
          severity: 'warning',
        },
      ],
      (diagnostic) => warnings.push(diagnostic),
      { failureHeading: 'Shared diagnostics failed:' },
    );

    expect(warnings).toEqual([
      {
        message: 'Use a newer WordPress feature.',
        severity: 'warning',
      },
    ]);
    expect(() =>
      handleDiagnostics(
        [
          {
            message: 'Required support is unavailable.',
            severity: 'error',
          },
        ],
        undefined,
        { failureHeading: 'Shared diagnostics failed:' },
      ),
    ).toThrow(
      'Shared diagnostics failed:\n- Required support is unavailable.',
    );
  });

  test('keeps warning diagnostics silent by default', () => {
    const originalWarn = console.warn;
    const consoleWarnings: unknown[][] = [];

    console.warn = (...args: unknown[]) => {
      consoleWarnings.push(args);
    };

    try {
      handleDiagnostics(
        [
          {
            message: 'Use a newer WordPress feature.',
            severity: 'warning',
          },
        ],
        undefined,
        { failureHeading: 'Shared diagnostics failed:' },
      );
    } finally {
      console.warn = originalWarn;
    }

    expect(consoleWarnings).toEqual([]);
  });

  test('emits warning diagnostics through explicit loggers', () => {
    const warnings: Array<{
      readonly diagnostic: { readonly message: string; readonly severity: 'warning' };
      readonly message: string;
    }> = [];

    handleDiagnostics(
      [
        {
          message: 'Use a newer WordPress feature.',
          severity: 'warning',
        },
      ],
      undefined,
      {
        failureHeading: 'Shared diagnostics failed:',
        logger: {
          warn: (message, diagnostic) => {
            warnings.push({ diagnostic, message });
          },
        },
      },
    );

    expect(warnings).toEqual([
      {
        diagnostic: {
          message: 'Use a newer WordPress feature.',
          severity: 'warning',
        },
        message: '[wp-typia] Use a newer WordPress feature.',
      },
    ]);
  });
});
