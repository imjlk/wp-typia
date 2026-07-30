import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  createManifestAttribute,
  createObjectBranchManifestAttribute,
  createUnionManifestAttribute,
  type ManifestAttribute,
  HELPERS_SOURCE,
} from './migration-test-harness-manifest.js';
import {
  createProjectShell,
  repoTtsxPath,
  writeFile,
  writeJson,
} from './migration-test-harness-runtime.js';
import { writeCurrentSnapshot } from './migration-test-harness-basic-projects.js';

export function createRenameCandidateProject(projectDir: string) {
  createProjectShell(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface RenameAttributes {\n\tcontent: string;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst success = typeof attributes.content === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$", expected: "RenameAttributes" }] };\n\t},\n\trandom() {\n\t\treturn { content: "Hello" };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/rename-smoke",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );
  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { type: 'string' },
    },
    name: 'create-block/rename-smoke',
    title: 'Rename Smoke',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        required: true,
      }),
    },
    manifestVersion: 2,
    sourceType: 'RenameAttributes',
  });
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        headline: { type: 'string' },
      },
      name: 'create-block/rename-smoke',
      title: 'Rename Smoke',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: {
        headline: createManifestAttribute('string', {
          required: true,
        }),
      },
      manifestVersion: 2,
      sourceType: 'RenameAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.headline ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}

export function createNestedRenameProject(projectDir: string) {
  createProjectShell(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface NestedRenameAttributes {\n\tsettings: {\n\t\tlabel: string;\n\t};\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.settings?.label ?? null;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst settings = attributes.settings as Record<string, unknown> | undefined;\n\t\tconst success =\n\t\t\ttypeof settings === "object" &&\n\t\t\tsettings !== null &&\n\t\t\ttypeof settings.label === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$.settings.label", expected: "string" }] };\n\t},\n\trandom() {\n\t\treturn { settings: { label: "Hello" } };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/nested-rename",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );
  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      settings: { type: 'object' },
    },
    name: 'create-block/nested-rename',
    title: 'Nested Rename',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      settings: {
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
          defaultValue: null,
          hasDefault: false,
        },
        ts: {
          items: null,
          kind: 'object',
          properties: {
            label: createManifestAttribute('string', { required: true }),
          },
          required: true,
          union: null,
        },
        wp: {
          defaultValue: null,
          enum: null,
          hasDefault: false,
          type: 'object',
        },
      },
    },
    manifestVersion: 2,
    sourceType: 'NestedRenameAttributes',
  });
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        settings: { type: 'object' },
      },
      name: 'create-block/nested-rename',
      title: 'Nested Rename',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: {
        settings: {
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
            defaultValue: null,
            hasDefault: false,
          },
          ts: {
            items: null,
            kind: 'object',
            properties: {
              title: createManifestAttribute('string', { required: true }),
            },
            required: true,
            union: null,
          },
          wp: {
            defaultValue: null,
            enum: null,
            hasDefault: false,
            type: 'object',
          },
        },
      },
      manifestVersion: 2,
      sourceType: 'NestedRenameAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.settings?.title ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}

export function createAmbiguousRenameProject(projectDir: string) {
  createProjectShell(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface AmbiguousRenameAttributes {\n\tcontent: string;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst success = typeof attributes.content === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$", expected: "AmbiguousRenameAttributes" }] };\n\t},\n\trandom() {\n\t\treturn { content: "Hello" };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/ambiguous-rename",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );
  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { type: 'string' },
    },
    name: 'create-block/ambiguous-rename',
    title: 'Ambiguous Rename',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        required: true,
      }),
    },
    manifestVersion: 2,
    sourceType: 'AmbiguousRenameAttributes',
  });
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        body: { type: 'string' },
        headline: { type: 'string' },
      },
      name: 'create-block/ambiguous-rename',
      title: 'Ambiguous Rename',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: {
        body: createManifestAttribute('string', {
          required: true,
        }),
        headline: createManifestAttribute('string', {
          required: true,
        }),
      },
      manifestVersion: 2,
      sourceType: 'AmbiguousRenameAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.headline ?? attributes.body ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}

export function createTypeCoercionProject(projectDir: string) {
  createProjectShell(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface CoercionAttributes {\n\tclickCount: number;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.clickCount ?? null;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst success = typeof attributes.clickCount === "number";\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$", expected: "CoercionAttributes" }] };\n\t},\n\trandom() {\n\t\treturn { clickCount: 1 };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/coercion-smoke",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );
  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      clickCount: { type: 'number' },
    },
    name: 'create-block/coercion-smoke',
    title: 'Coercion Smoke',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      clickCount: createManifestAttribute('number', {
        required: true,
      }),
    },
    manifestVersion: 2,
    sourceType: 'CoercionAttributes',
  });
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        clickCount: { type: 'string' },
      },
      name: 'create-block/coercion-smoke',
      title: 'Coercion Smoke',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: {
        clickCount: createManifestAttribute('string', {
          required: true,
        }),
      },
      manifestVersion: 2,
      sourceType: 'CoercionAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.clickCount ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}

export function createUnionProject(projectDir: string, { removeBranch = false }: { removeBranch?: boolean } = {}) {
  createProjectShell(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface UnionAttributes {\n\tlinkTarget: {\n\t\thref?: string;\n\t\tkind: string;\n\t\tpostId?: number;\n\t};\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.linkTarget ?? null;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst target = attributes.linkTarget as Record<string, unknown> | undefined;\n\t\tconst success = typeof target === "object" && target !== null && typeof target.kind === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$", expected: "UnionAttributes" }] };\n\t},\n\trandom() {\n\t\treturn { linkTarget: { kind: "post", postId: 1 } };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/union-smoke",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );

  const currentBranches: Record<string, ManifestAttribute> = removeBranch
    ? {
        post: createObjectBranchManifestAttribute('kind', 'post', {
          postId: createManifestAttribute('number', {
            required: true,
          }),
        }),
      }
    : {
        post: createObjectBranchManifestAttribute('kind', 'post', {
          postId: createManifestAttribute('number', {
            required: true,
          }),
        }),
        url: createObjectBranchManifestAttribute('kind', 'url', {
          href: createManifestAttribute('string', {
            required: true,
          }),
        }),
      };
  const legacyBranches: Record<string, ManifestAttribute> = removeBranch
    ? {
        post: createObjectBranchManifestAttribute('kind', 'post', {
          postId: createManifestAttribute('number', {
            required: true,
          }),
        }),
        url: createObjectBranchManifestAttribute('kind', 'url', {
          href: createManifestAttribute('string', {
            required: true,
          }),
        }),
      }
    : {
        post: createObjectBranchManifestAttribute('kind', 'post', {
          postId: createManifestAttribute('number', {
            required: true,
          }),
        }),
      };

  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      linkTarget: { type: 'object' },
    },
    name: 'create-block/union-smoke',
    title: 'Union Smoke',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      linkTarget: createUnionManifestAttribute('kind', currentBranches),
    },
    manifestVersion: 2,
    sourceType: 'UnionAttributes',
  });
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        linkTarget: { type: 'object' },
      },
      name: 'create-block/union-smoke',
      title: 'Union Smoke',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: {
        linkTarget: createUnionManifestAttribute('kind', legacyBranches),
      },
      manifestVersion: 2,
      sourceType: 'UnionAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.linkTarget ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}

export function createFuzzFailureProject(projectDir: string) {
  createProjectShell(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface FuzzFailureAttributes {\n\tcontent: string;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst success = attributes.content === "Hello";\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$.content", expected: '"Hello"' }] };\n\t},\n\trandom() {\n\t\treturn { content: "legacy-random" };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/fuzz-failure",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );
  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { default: 'Hello', type: 'string' },
    },
    name: 'create-block/fuzz-failure',
    title: 'Fuzz Failure',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        defaultValue: 'Hello',
        required: true,
      }),
    },
    manifestVersion: 2,
    sourceType: 'FuzzFailureAttributes',
  });
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        content: { default: 'Hello', type: 'string' },
      },
      name: 'create-block/fuzz-failure',
      title: 'Fuzz Failure',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: {
        content: createManifestAttribute('string', {
          defaultValue: 'Hello',
          required: true,
        }),
      },
      manifestVersion: 2,
      sourceType: 'FuzzFailureAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.content ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}

/**
 * Creates a project where a string attribute's default value changes between v1
 * and the current snapshot. The current schema keeps `label` with default
 * "Updated" while the v1 snapshot has `label` with default "Original". This
 * exercises the `default-change` diff kind.
 */
export function createDefaultChangeProject(projectDir: string) {
  createProjectShell(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface DefaultChangeAttributes {\n\tlabel: string;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.label ?? null;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst success = typeof attributes.label === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$.label", expected: "string" }] };\n\t},\n\trandom() {\n\t\treturn { label: "Updated" };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/default-change",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );
  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      label: { default: 'Updated', type: 'string' },
    },
    name: 'create-block/default-change',
    title: 'Default Change',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      label: createManifestAttribute('string', {
        defaultValue: 'Updated',
        required: false,
      }),
    },
    manifestVersion: 2,
    sourceType: 'DefaultChangeAttributes',
  });
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        label: { default: 'Original', type: 'string' },
      },
      name: 'create-block/default-change',
      title: 'Default Change',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: {
        label: createManifestAttribute('string', {
          defaultValue: 'Original',
          required: false,
        }),
      },
      manifestVersion: 2,
      sourceType: 'DefaultChangeAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.label ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}

/**
 * Creates a project where a top-level attribute is removed between the v1
 * snapshot and the current schema. The v1 snapshot has `title` and `content`,
 * while the current schema only has `content`. This exercises the `drop` diff
 * kind and the `removal` risk bucket.
 */
export function createRemovalProject(projectDir: string) {
  createProjectShell(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface RemovalAttributes {\n\tcontent: string;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.content ?? null;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst success = typeof attributes.content === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$.content", expected: "string" }] };\n\t},\n\trandom() {\n\t\treturn { content: "Hello" };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/removal-smoke",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );
  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      content: { default: 'Hello', type: 'string' },
    },
    name: 'create-block/removal-smoke',
    title: 'Removal Smoke',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: {
      content: createManifestAttribute('string', {
        defaultValue: 'Hello',
        required: true,
      }),
    },
    manifestVersion: 2,
    sourceType: 'RemovalAttributes',
  });
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        content: { default: 'Hello', type: 'string' },
        title: { default: 'Old Title', type: 'string' },
      },
      name: 'create-block/removal-smoke',
      title: 'Removal Smoke',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: {
        content: createManifestAttribute('string', {
          defaultValue: 'Hello',
          required: true,
        }),
        title: createManifestAttribute('string', {
          defaultValue: 'Old Title',
          required: false,
        }),
      },
      manifestVersion: 2,
      sourceType: 'RemovalAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.content ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}

/**
 * Creates a project where a nested property inside a retained object is
 * removed between v1 and current. The v1 snapshot has
 * `settings.{label,legacyFlag}` while current has `settings.{label}` only.
 * This exercises the nested property drop detection (P1-3).
 */
export function createNestedDropProject(projectDir: string) {
  createProjectShell(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface NestedDropAttributes {\n\tsettings: { label: string };\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.settings?.label ?? null;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst settings = attributes.settings as Record<string, unknown> | undefined;\n\t\tconst success = typeof settings === "object" && settings !== null && typeof settings.label === "string";\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$.settings.label", expected: "string" }] };\n\t},\n\trandom() {\n\t\treturn { settings: { label: "Hello" } };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/nested-drop",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );

  const currentSettings = createManifestAttribute('object', {
    required: true,
  });
  currentSettings.ts.properties = {
    label: createManifestAttribute('string', {
      defaultValue: 'Default',
      required: false,
    }),
  };

  const legacySettings = createManifestAttribute('object', {
    required: true,
  });
  legacySettings.ts.properties = {
    label: createManifestAttribute('string', {
      defaultValue: 'Default',
      required: false,
    }),
    legacyFlag: createManifestAttribute('string', {
      defaultValue: 'old',
      required: false,
    }),
  };

  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      settings: { type: 'object' },
    },
    name: 'create-block/nested-drop',
    title: 'Nested Drop',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: { settings: currentSettings },
    manifestVersion: 2,
    sourceType: 'NestedDropAttributes',
  });
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        settings: { type: 'object' },
      },
      name: 'create-block/nested-drop',
      title: 'Nested Drop',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: { settings: legacySettings },
      manifestVersion: 2,
      sourceType: 'NestedDropAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.settings?.label ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}

/**
 * Creates a project where an object attribute's own default value changes
 * between v1 and current. The v1 snapshot has `config` with default
 * `{ enabled: false }` while current has `config` with default
 * `{ enabled: true }`. This exercises composite default-change detection
 * (P1-1).
 */
export function createCompositeDefaultChangeProject(projectDir: string) {
  createProjectShell(projectDir);

  writeFile(
    path.join(projectDir, 'src', 'types.ts'),
    `export interface CompositeDefaultAttributes {\n\tconfig: { enabled: boolean };\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.config?.enabled ?? null;\n}\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'validators.ts'),
    `export const validators = {\n\tvalidate(input: unknown) {\n\t\tconst attributes = input as Record<string, unknown>;\n\t\tconst config = attributes.config as Record<string, unknown> | undefined;\n\t\tconst success = typeof config === "object" && config !== null && typeof config.enabled === "boolean";\n\t\treturn success\n\t\t\t? { success: true as const, data: attributes }\n\t\t\t: { success: false as const, errors: [{ path: "$.config.enabled", expected: "boolean" }] };\n\t},\n\trandom() {\n\t\treturn { config: { enabled: true } };\n\t},\n};\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'config.ts'),
    `export const migrationConfig = {\n\tblockName: "create-block/composite-default",\n\tcurrentMigrationVersion: "v3",\n\tsupportedMigrationVersions: ["v1", "v3"],\n\tsnapshotDir: "src/migrations/versions",\n} as const;\n\nexport default migrationConfig;\n`,
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'helpers.ts'),
    HELPERS_SOURCE,
  );

  function makeConfigAttr(defaultValue: Record<string, unknown>) {
    const attr = createManifestAttribute('object', { required: true });
    attr.typia.defaultValue = defaultValue;
    attr.typia.hasDefault = true;
    attr.wp.defaultValue = defaultValue;
    attr.wp.hasDefault = true;
    attr.ts.properties = {
      enabled: createManifestAttribute('boolean', {
        defaultValue: defaultValue.enabled,
        required: false,
      }),
    };
    return attr;
  }

  writeJson(path.join(projectDir, 'block.json'), {
    apiVersion: 3,
    attributes: {
      config: { type: 'object' },
    },
    name: 'create-block/composite-default',
    title: 'Composite Default',
  });
  writeJson(path.join(projectDir, 'typia.manifest.json'), {
    attributes: { config: makeConfigAttr({ enabled: true }) },
    manifestVersion: 2,
    sourceType: 'CompositeDefaultAttributes',
  });
  writeJson(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'block.json'),
    {
      apiVersion: 3,
      attributes: {
        config: { type: 'object' },
      },
      name: 'create-block/composite-default',
      title: 'Composite Default',
    },
  );
  writeJson(
    path.join(
      projectDir,
      'src',
      'migrations',
      'versions',
      'v1',
      'typia.manifest.json',
    ),
    {
      attributes: { config: makeConfigAttr({ enabled: false }) },
      manifestVersion: 2,
      sourceType: 'CompositeDefaultAttributes',
    },
  );
  writeFile(
    path.join(projectDir, 'src', 'migrations', 'versions', 'v1', 'save.tsx'),
    `export default function Save({ attributes }: { attributes: any }) {\n\treturn attributes.config?.enabled ?? null;\n}\n`,
  );
  writeCurrentSnapshot(projectDir);

  const localBinDir = path.join(projectDir, 'node_modules', '.bin');
  fs.mkdirSync(localBinDir, { recursive: true });
  fs.symlinkSync(repoTtsxPath, path.join(localBinDir, 'ttsx'));
}
