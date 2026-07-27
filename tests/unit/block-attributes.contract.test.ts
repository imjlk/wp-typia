import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasPhpBinary } from '../helpers/file-fixtures';
import {
  ensureExampleShowcaseSynced,
  getExampleShowcaseDir,
} from './helpers/example-showcase';

ensureExampleShowcaseSynced();

type ManifestAttribute = {
  typia: {
    constraints: {
      exclusiveMaximum: number | null;
      exclusiveMinimum: number | null;
      format: string | null;
      maxLength: number | null;
      maxItems: number | null;
      maximum: number | null;
      minLength: number | null;
      minItems: number | null;
      minimum: number | null;
      multipleOf: number | null;
      pattern: string | null;
      typeTag: string | null;
    };
    defaultValue: unknown;
    hasDefault: boolean;
  };
  ts: {
    kind: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'union';
    required: boolean;
    union?: unknown;
  };
  wp: {
    defaultValue: unknown;
    enum: unknown[] | null;
    hasDefault: boolean;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  };
};

type ContractManifest = {
  attributes: Record<string, ManifestAttribute>;
};

type BlockJsonContract = {
  attributes: Record<
    string,
    {
      default?: unknown;
      enum?: unknown[];
      type: string;
    }
  >;
};

type ValidationResult = {
  errors: string[];
  valid: boolean;
};

const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_TIME_RFC3339_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function matchesContractFormat(format: string, value: string): boolean {
  switch (format) {
    case 'uuid':
      return UUID_V4_LIKE.test(value);
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'url':
    case 'uri':
      return /^https?:\/\/\S+$/.test(value);
    case 'ipv4':
      return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(
        value,
      );
    case 'ipv6':
      return /^[0-9a-f:]+$/i.test(value) && value.includes(':');
    case 'date-time':
      return DATE_TIME_RFC3339_LIKE.test(value);
    default:
      return true;
  }
}

function matchesContractTypeTag(typeTag: string, value: number): boolean {
  switch (typeTag) {
    case 'uint32':
      return Number.isInteger(value) && value >= 0 && value <= 4294967295;
    case 'int32':
      return Number.isInteger(
        value,
      ) && value >= -2147483648 && value <= 2147483647;
    case 'uint64':
      return Number.isInteger(value) && value >= 0;
    case 'float':
    case 'double':
      return Number.isFinite(value);
    default:
      return true;
  }
}

function matchesContractMultipleOf(value: number, multipleOf: number): boolean {
  if (multipleOf === 0) {
    return true;
  }

  if (Number.isInteger(value) && Number.isInteger(multipleOf)) {
    return value % multipleOf === 0;
  }

  const remainder = value % multipleOf;
  const epsilon = 1e-9;
  return (
    Math.abs(remainder) < epsilon ||
    Math.abs(Math.abs(multipleOf) - Math.abs(remainder)) < epsilon
  );
}

function loadExampleContract() {
  const testTemplateDir = getExampleShowcaseDir();
  const blockJson = JSON.parse(
    fs.readFileSync(path.join(testTemplateDir, 'block.json'), 'utf8'),
  ) as BlockJsonContract;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(testTemplateDir, 'typia.manifest.json'), 'utf8'),
  ) as ContractManifest;

  return { blockJson, manifest };
}

function loadPhpValidatorPath() {
  return path.join(getExampleShowcaseDir(), 'typia-validator.php');
}

function escapePhpSingleQuotedString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function validatePayload(
  manifest: ContractManifest,
  payload: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];

  for (const [attributeName, attribute] of Object.entries(
    manifest.attributes,
  )) {
    const value = payload[attributeName];

    if (value === undefined) {
      if (attribute.ts.required && !attribute.typia.hasDefault && !attribute.wp.hasDefault) {
        errors.push(`${attributeName} is required`);
      }
      continue;
    }

    if (value === null) {
      errors.push(`${attributeName} must be ${attribute.ts.kind}`);
      continue;
    }

    if (attribute.ts.kind === 'string' && typeof value !== 'string') {
      errors.push(`${attributeName} must be string`);
      continue;
    }

    if (attribute.ts.kind === 'number' && typeof value !== 'number') {
      errors.push(`${attributeName} must be number`);
      continue;
    }

    if (attribute.ts.kind === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${attributeName} must be boolean`);
      continue;
    }

    if (attribute.ts.kind === 'array' && !Array.isArray(value)) {
      errors.push(`${attributeName} must be array`);
      continue;
    }

    if (attribute.wp.enum && !attribute.wp.enum.includes(value)) {
      errors.push(
        `${attributeName} must be one of ${attribute.wp.enum.join(', ')}`,
      );
    }

    if (typeof value === 'string') {
      if (attribute.typia.constraints.minLength !== null && value.length < attribute.typia.constraints.minLength) {
        errors.push(
          `${attributeName} must be at least ${attribute.typia.constraints.minLength} characters`,
        );
      }

      if (attribute.typia.constraints.maxLength !== null && value.length > attribute.typia.constraints.maxLength) {
        errors.push(
          `${attributeName} must be at most ${attribute.typia.constraints.maxLength} characters`,
        );
      }

      if (attribute.typia.constraints.pattern !== null) {
        const regex = new RegExp(attribute.typia.constraints.pattern);
        if (!regex.test(value)) {
          errors.push(
            `${attributeName} does not match ${attribute.typia.constraints.pattern}`,
          );
        }
      }

      if (attribute.typia.constraints.format !== null && !matchesContractFormat(
        attribute.typia.constraints.format,
        value,
      )) {
        errors.push(
          `${attributeName} must match format ${attribute.typia.constraints.format}`,
        );
      }
    }

    if (typeof value === 'number') {
      if (attribute.typia.constraints.minimum !== null && value < attribute.typia.constraints.minimum) {
        errors.push(
          `${attributeName} must be >= ${attribute.typia.constraints.minimum}`,
        );
      }

      if (attribute.typia.constraints.maximum !== null && value > attribute.typia.constraints.maximum) {
        errors.push(
          `${attributeName} must be <= ${attribute.typia.constraints.maximum}`,
        );
      }

      if (attribute.typia.constraints.exclusiveMinimum !== null && value <= attribute.typia.constraints.exclusiveMinimum) {
        errors.push(
          `${attributeName} must be > ${attribute.typia.constraints.exclusiveMinimum}`,
        );
      }

      if (attribute.typia.constraints.exclusiveMaximum !== null && value >= attribute.typia.constraints.exclusiveMaximum) {
        errors.push(
          `${attributeName} must be < ${attribute.typia.constraints.exclusiveMaximum}`,
        );
      }

      if (
        attribute.typia.constraints.multipleOf !== null &&
        !matchesContractMultipleOf(
          value,
          attribute.typia.constraints.multipleOf,
        )
      ) {
        errors.push(
          `${attributeName} must be a multiple of ${attribute.typia.constraints.multipleOf}`,
        );
      }

      if (attribute.typia.constraints.typeTag !== null && !matchesContractTypeTag(
        attribute.typia.constraints.typeTag,
        value,
      )) {
        errors.push(
          `${attributeName} must be a ${attribute.typia.constraints.typeTag}`,
        );
      }
    }

    if (Array.isArray(value)) {
      if (attribute.typia.constraints.minItems !== null && value.length < attribute.typia.constraints.minItems) {
        errors.push(
          `${attributeName} must have at least ${attribute.typia.constraints.minItems} items`,
        );
      }

      if (attribute.typia.constraints.maxItems !== null && value.length > attribute.typia.constraints.maxItems) {
        errors.push(
          `${attributeName} must have at most ${attribute.typia.constraints.maxItems} items`,
        );
      }
    }
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}

function runPhpValidator<T extends Record<string, unknown> | unknown[]>(
  method: 'apply_defaults' | 'validate',
  payload: Record<string, unknown>,
): T {
  const validatorPath = loadPhpValidatorPath();
  const encodedPayload = escapePhpSingleQuotedString(JSON.stringify(payload));
  const phpSource = `if (!defined('ABSPATH')) { define('ABSPATH', '/tmp/wp-typia-test/'); } $validator = require '${escapePhpSingleQuotedString(validatorPath)}'; $payload = json_decode('${encodedPayload}', true); echo json_encode($validator->${method}($payload), JSON_UNESCAPED_SLASHES);`;

  return JSON.parse(
    execFileSync('php', ['-r', phpSource], { encoding: 'utf8' }),
  ) as T;
}

describe('Typia block attribute contract', () => {
  test('keeps block.json defaults aligned with typia.manifest defaults', () => {
    const { blockJson, manifest } = loadExampleContract();

    expect(blockJson.attributes.version.default).toBe(
      manifest.attributes.version.typia.defaultValue,
    );
    expect(blockJson.attributes.content.default).toBe(
      manifest.attributes.content.typia.defaultValue,
    );
    expect(blockJson.attributes.alignment.default).toBe(
      manifest.attributes.alignment.typia.defaultValue,
    );
    expect(blockJson.attributes.isVisible.default).toBe(
      manifest.attributes.isVisible.typia.defaultValue,
    );
  });

  test('generates a php validator that applies defaults and passes lint', () => {
    if (!hasPhpBinary()) {
      return;
    }

    const validatorPath = loadPhpValidatorPath();
    execFileSync('php', ['-l', validatorPath], { stdio: 'ignore' });

    const normalized = runPhpValidator<Record<string, unknown>>(
      'apply_defaults',
      {
        content: 'Hello Typia',
      },
    );

    expect(normalized.version).toBe(1);
    expect(normalized.alignment).toBe('left');
    expect(normalized.isVisible).toBe(true);
  });

  test('accepts a valid payload that matches metadata projection and typia constraints', () => {
    const { manifest } = loadExampleContract();

    const result = validatePayload(manifest, {
      id: '00000000-0000-4000-8000-000000000000',
      version: 1,
      className: 'hero-callout',
      content: 'Hello Typia',
      alignment: 'center',
      isVisible: false,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('rejects invalid null and enum payloads', () => {
    const { manifest } = loadExampleContract();

    const result = validatePayload(manifest, {
      content: null,
      alignment: 'invalid',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('content must be string');
    expect(result.errors).toContain(
      'alignment must be one of left, center, right, justify',
    );
  });

  test('rejects manifest-only format and length constraint violations', () => {
    const { manifest } = loadExampleContract();

    const result = validatePayload(manifest, {
      id: 'not-a-uuid',
      className: 'x'.repeat(101),
      content: 'y'.repeat(1001),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id must match format uuid');
    expect(result.errors).toContain('className must be at most 100 characters');
    expect(result.errors).toContain('content must be at most 1000 characters');
  });

  test('generated php validator rejects invalid enum, uuid, and uint32 payloads', () => {
    if (!hasPhpBinary()) {
      return;
    }

    const result = runPhpValidator<{ errors: string[]; valid: boolean }>(
      'validate',
      {
        id: 'not-a-uuid',
        version: -1,
        content: null,
        alignment: 'invalid',
      },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id must match format uuid');
    expect(result.errors).toContain('version must be a uint32');
    expect(result.errors).toContain('content must be string');
    expect(result.errors).toContain(
      'alignment must be one of left, center, right, justify',
    );
  });

  test('contract helper models additive format, number, and array constraints', () => {
    const manifest: ContractManifest = {
      attributes: {
        contactEmail: {
          typia: {
            constraints: {
              exclusiveMaximum: null,
              exclusiveMinimum: null,
              format: 'email',
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
            defaultValue: null,
            hasDefault: false,
          },
          ts: { kind: 'string', required: true },
          wp: {
            defaultValue: null,
            enum: null,
            hasDefault: false,
            type: 'string',
          },
        },
        opacity: {
          typia: {
            constraints: {
              exclusiveMaximum: 1,
              exclusiveMinimum: 0,
              format: null,
              maxLength: null,
              maxItems: null,
              maximum: null,
              minLength: null,
              minItems: null,
              minimum: null,
              multipleOf: 0.25,
              pattern: null,
              typeTag: 'double',
            },
            defaultValue: null,
            hasDefault: false,
          },
          ts: { kind: 'number', required: true },
          wp: {
            defaultValue: null,
            enum: null,
            hasDefault: false,
            type: 'number',
          },
        },
        slides: {
          typia: {
            constraints: {
              exclusiveMaximum: null,
              exclusiveMinimum: null,
              format: null,
              maxLength: null,
              maxItems: 3,
              maximum: null,
              minLength: null,
              minItems: 1,
              minimum: null,
              multipleOf: null,
              pattern: null,
              typeTag: null,
            },
            defaultValue: null,
            hasDefault: false,
          },
          ts: { kind: 'array', required: true },
          wp: {
            defaultValue: null,
            enum: null,
            hasDefault: false,
            type: 'array',
          },
        },
      },
    };

    const result = validatePayload(manifest, {
      contactEmail: 'not-an-email',
      opacity: 1,
      slides: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('contactEmail must match format email');
    expect(result.errors).toContain('opacity must be < 1');
    expect(result.errors).toContain('slides must have at least 1 items');
  });
});
