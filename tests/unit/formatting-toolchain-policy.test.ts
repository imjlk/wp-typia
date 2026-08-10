import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  FORMATTING_TOOLCHAIN_POLICY,
  validateFormattingToolchainPolicy,
} from '../../scripts/validate-formatting-toolchain-policy.mjs';

let tempDirs: string[] = [];
const sourceRepoRoot = path.resolve(import.meta.dir, '..', '..');

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
  tempDirs = [];
});

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function createFormattingPolicyRepo() {
  const repoRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wp-typia-format-policy-'),
  );
  tempDirs.push(repoRoot);
  const policy = FORMATTING_TOOLCHAIN_POLICY;

  writeJson(path.join(repoRoot, 'package.json'), {
    dependencies: {
      typia: policy.typiaVersion,
    },
    devDependencies: {
      '@ttsc/lint': policy.ttscLintVersion,
      '@typescript/typescript6': policy.typescript6Version,
      '@eslint/js': policy.eslintJsVersion,
      'eslint-config-prettier': policy.eslintConfigPrettierVersion,
      eslint: policy.eslintVersion,
      prettier: policy.prettierVersion,
      ttsc: policy.ttscVersion,
    },
    scripts: {
      'ci:local':
        'bun run formatting-policy:validate && bun run format:check && bun run lint:all && bun run typecheck',
      'format:write': policy.rootFormatWriteScript,
      'format:check': policy.rootFormatCheckScript,
      'lint:fix': policy.rootLintFixScript,
      'lint:repo': policy.rootLintScript,
      'formatting-policy:validate': policy.rootPolicyValidateScript,
      typecheck: policy.rootTypecheckScript,
    },
    patchedDependencies: policy.compatibilityPatches,
  });

  for (const patchPath of Object.values(policy.compatibilityPatches)) {
    writeText(
      path.join(repoRoot, patchPath),
      fs.readFileSync(path.join(sourceRepoRoot, patchPath), 'utf8'),
    );
  }

  writeText(
    path.join(repoRoot, 'lint.config.ts'),
    `export default ${JSON.stringify(policy.ttscLintConfig, null, 2)};\n`,
  );
  writeText(path.join(repoRoot, 'eslint.config.mjs'), 'export default [];\n');

  for (const relativePath of policy.workspaceExamplePackagePaths) {
    writeJson(path.join(repoRoot, relativePath), {
      devDependencies: {
        '@ttsc/lint': `^${policy.ttscLintVersion}`,
        prettier: policy.prettierVersion,
        ttsc: `^${policy.ttscVersion}`,
      },
    });
  }

  for (const relativePath of policy.workspaceExampleStaticLintConfigPaths) {
    writeText(
      path.join(repoRoot, relativePath),
      `export default ${JSON.stringify(
        policy.workspaceExampleTtscLintConfig,
        null,
        2,
      )};\n`,
    );
  }

  for (const relativePath of policy.workspaceWordPressLintConfigPaths) {
    writeText(
      path.join(repoRoot, relativePath),
      `import { configs } from '@wp-typia/ttsc-lint-plugin-wp';
export default {
  ...configs.wpScriptsRecommended,
  format: ${JSON.stringify(policy.generatedTtscLintFormat)},
  rules: {
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: 'example' },
    ],
  },
};
`,
    );
  }

  for (const relativePath of policy.workspaceWordPressPrettierConfigPaths) {
    writeText(
      path.join(repoRoot, relativePath),
      `export default ${JSON.stringify(policy.generatedPrettierConfig)};\n`,
    );
  }

  for (const relativePath of policy.workspaceWordPressPrettierIgnorePaths) {
    writeText(
      path.join(repoRoot, relativePath),
      `${policy.generatedPrettierIgnorePatterns.join('\n')}\n`,
    );
  }

  for (const relativePath of policy.wpScriptsExamplePackagePaths) {
    const examplePackagePath = path.join(repoRoot, relativePath);
    const examplePackageJson = JSON.parse(
      fs.readFileSync(examplePackagePath, 'utf8'),
    );
    examplePackageJson.scripts = {
      'check:code': policy.exampleCodeCheckScript,
      'check:style': policy.exampleStyleCheckScript,
      'check:format': policy.exampleFormatCheckScript,
      check: policy.exampleCheckScript,
      format: policy.exampleWpScriptsFormatScript,
    };
    writeJson(examplePackagePath, examplePackageJson);
  }

  for (const relativePath of policy.generatedPackageManifestPaths) {
    const scripts: Record<string, string> = {
      'check:code':
        relativePath ===
        'packages/wp-typia-project-tools/templates/query-loop/package.json.mustache'
          ? policy.generatedQueryLoopCodeCheckScript
          : policy.generatedCodeCheckScript,
      'check:style': policy.generatedStyleCheckScript,
      'check:format': policy.generatedFormatCheckScript,
      check: policy.generatedCheckScript,
      format: policy.generatedWpScriptsFormatScript,
      postinstall: policy.generatedTtscLintCompatScript,
    };
    writeJson(path.join(repoRoot, relativePath), {
      scripts,
      devDependencies: {
        '@ttsc/lint': policy.ttscLintVersion,
        '@wp-typia/ttsc-lint-plugin-wp':
          policy.generatedWordPressTtscLintPluginVersion,
        '@types/react': policy.generatedReactTypesVersion,
        '@types/react-dom': policy.generatedReactDomTypesVersion,
        prettier: policy.prettierVersion,
        react: policy.generatedReactVersion,
        'react-dom': policy.generatedReactDomVersion,
        ttsc: `^${policy.ttscVersion}`,
      },
    });
  }

  for (const relativePath of policy.generatedWordPressTtscLintConfigPaths) {
    writeText(
      path.join(repoRoot, relativePath),
      `import { configs } from '@wp-typia/ttsc-lint-plugin-wp';
export default {
  ...configs.wpScriptsRecommended,
  format: ${JSON.stringify(policy.generatedTtscLintFormat)},
  rules: {
    'wordpress/i18n-text-domain': [
      'error',
      { allowedTextDomain: '{{textDomain}}' },
    ],
  },
};
`,
    );
  }

  for (const templateRoot of policy.generatedTtscLintCompatTemplateRoots) {
    writeText(
      path.join(
        repoRoot,
        templateRoot,
        policy.generatedTtscLintCompatTemplatePath,
      ),
      `const REQUIRED_VERSION = '${policy.ttscLintVersion}';
const sourcePath = path.join('linthost', 'rules_format_trailing_comma.go');
if node.Parent.FunctionLikeData() == nil {
}
fs.writeFileSync(
  sourcePath,
  source,
);
fs.renameSync(temporaryPath, sourcePath);
`,
    );
    writeText(
      path.join(
        repoRoot,
        templateRoot,
        `${policy.generatedPrettierConfigPath}.mustache`,
      ),
      `export default ${JSON.stringify(policy.generatedPrettierConfig)};\n`,
    );
    writeText(
      path.join(
        repoRoot,
        templateRoot,
        `${policy.generatedPrettierIgnorePath}.mustache`,
      ),
      `${policy.generatedPrettierIgnorePatterns.join('\n')}\n`,
    );
  }

  writeText(
    path.join(repoRoot, '.github/workflows/ci.yml'),
    `jobs:\n  lint:\n    steps:\n      - name: Validate formatting toolchain policy\n        run: bun run formatting-policy:validate\n      - name: Run formatting check\n        run: bun run format:check\n      - name: Run type check\n        run: bun run typecheck\n  node-20-baseline:\n    steps: []\n`,
  );

  return repoRoot;
}

describe('validateFormattingToolchainPolicy', () => {
  test('passes when the repo matches the documented formatting baseline', () => {
    const repoRoot = createFormattingPolicyRepo();

    expect(validateFormattingToolchainPolicy(repoRoot)).toEqual({
      errors: [],
      valid: true,
    });
  });

  test('fails when root formatter package versions drift', () => {
    const repoRoot = createFormattingPolicyRepo();
    const packageJsonPath = path.join(repoRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.devDependencies.prettier = '3.0.0';
    writeJson(packageJsonPath, packageJson);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `package.json must declare devDependencies.prettier="${FORMATTING_TOOLCHAIN_POLICY.prettierVersion}", found "3.0.0".`,
    );
  });

  test('fails when a required compatibility patch mapping is missing', () => {
    const repoRoot = createFormattingPolicyRepo();
    const packageJsonPath = path.join(repoRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    delete packageJson.patchedDependencies['typia@13.2.0'];
    writeJson(packageJsonPath, packageJson);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'package.json must declare patchedDependencies["typia@13.2.0"]="patches/typia@13.2.0.patch", found null.',
    );
  });

  test('fails when a patch key or path drifts from its exact package version', () => {
    const repoRoot = createFormattingPolicyRepo();
    const packageJsonPath = path.join(repoRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.dependencies.typia = '13.2.1';
    delete packageJson.patchedDependencies['typia@13.2.0'];
    packageJson.patchedDependencies['typia@13.2.1'] =
      'patches/typia@13.2.1.patch';
    packageJson.patchedDependencies['@ttsc/lint@0.26.1'] =
      'patches/lint.patch';
    writeJson(packageJsonPath, packageJson);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'package.json must declare dependencies.typia="13.2.0", found "13.2.1".',
    );
    expect(result.errors).toContain(
      'package.json must declare patchedDependencies["typia@13.2.0"]="patches/typia@13.2.0.patch", found null.',
    );
    expect(result.errors).toContain(
      'package.json must declare patchedDependencies["@ttsc/lint@0.26.1"]="patches/@ttsc%2Flint@0.26.1.patch", found "patches/lint.patch".',
    );
    expect(result.errors).toContain(
      'package.json must not declare undocumented compatibility patch "typia@13.2.1".',
    );
  });

  test('fails when a required compatibility patch file is missing', () => {
    const repoRoot = createFormattingPolicyRepo();
    fs.rmSync(path.join(repoRoot, 'patches/typia@13.2.0.patch'));

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'patches/typia@13.2.0.patch must exist as the compatibility patch for "typia@13.2.0".',
    );
  });

  test('fails when a compatibility patch digest drifts', () => {
    const repoRoot = createFormattingPolicyRepo();
    const patchPath = 'patches/typia@13.2.0.patch';
    fs.appendFileSync(path.join(repoRoot, patchPath), 'unexpected patch hunk\n');

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.startsWith(
          `${patchPath} must match the expected SHA-256 compatibility patch digest for "typia@13.2.0"`,
        ),
      ),
    ).toBe(true);
  });

  test('fails when a generated ttsc lint compatibility hook drifts', () => {
    const repoRoot = createFormattingPolicyRepo();
    const manifestPath = path.join(
      repoRoot,
      'packages/create-workspace-template/package.json.mustache',
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.devDependencies['@ttsc/lint'] = '^0.26.1';
    delete manifest.scripts.postinstall;
    writeJson(manifestPath, manifest);
    fs.rmSync(
      path.join(
        repoRoot,
        'packages/create-workspace-template',
        FORMATTING_TOOLCHAIN_POLICY.generatedTtscLintCompatTemplatePath,
      ),
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'packages/create-workspace-template/package.json.mustache must declare devDependencies["@ttsc/lint"]="0.26.1" while the generated compatibility hook targets that exact source, found "^0.26.1".',
    );
    expect(result.errors).toContain(
      'packages/create-workspace-template/package.json.mustache must keep scripts.postinstall="node scripts/apply-ttsc-lint-compat.mjs", found null.',
    );
    expect(result.errors).toContain(
      'packages/create-workspace-template/scripts/apply-ttsc-lint-compat.mjs.mustache must exist so generated projects patch the exact @ttsc/lint source before ttsc runs.',
    );
  });

  test('fails when generated WordPress ttsc lint integration drifts', () => {
    const repoRoot = createFormattingPolicyRepo();
    const manifestPath = path.join(
      repoRoot,
      'packages/create-workspace-template/package.json.mustache',
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    delete manifest.devDependencies['@wp-typia/ttsc-lint-plugin-wp'];
    writeJson(manifestPath, manifest);

    const configPath = path.join(
      repoRoot,
      'packages/create-workspace-template/lint.config.mts.mustache',
    );
    writeText(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace("allowedTextDomain: '{{textDomain}}'", "allowedTextDomain: 'wordpress'"),
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'packages/create-workspace-template/package.json.mustache must declare devDependencies["@wp-typia/ttsc-lint-plugin-wp"]="{{ttscLintPluginWpPackageVersion}}", found null.',
    );
    expect(result.errors).toContain(
      'packages/create-workspace-template/lint.config.mts.mustache must include "allowedTextDomain: \'{{textDomain}}\'" for the generated WordPress ttsc lint contract.',
    );
  });

  test('keeps generated ttsc format diagnostics write-only', () => {
    const repoRoot = createFormattingPolicyRepo();
    const relativePath =
      'packages/create-workspace-template/lint.config.mts.mustache';
    const configPath = path.join(repoRoot, relativePath);
    writeText(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace(
          'rules: {',
          "format: { severity: 'error' },\n  rules: {",
        ),
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `${relativePath} must keep generated ttsc formatting write-only during check:code; found {"severity":"error"}, expected {"severity":"off","printWidth":80,"tabWidth":2,"useTabs":false,"semi":true,"singleQuote":true,"trailingComma":"all","endOfLine":"lf","sortImports":false,"jsDoc":false}.`,
    );
  });

  test('compares generated ttsc lint hooks with the explicit shared-base canonical source', () => {
    const repoRoot = createFormattingPolicyRepo();
    const relativePath = path.join(
      'packages/create-workspace-template',
      FORMATTING_TOOLCHAIN_POLICY.generatedTtscLintCompatTemplatePath,
    );
    fs.appendFileSync(
      path.join(repoRoot, relativePath),
      '\n// Noncanonical generated hook drift.\n',
      'utf8',
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `${relativePath} must match the canonical generated @ttsc/lint compatibility hook byte-for-byte.`,
    );
  });

  test('fails when the root ESLint and ttsc stacks drift from the documented baseline', () => {
    const repoRoot = createFormattingPolicyRepo();
    const packageJsonPath = path.join(repoRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.devDependencies.eslint = '9.0.0';
    packageJson.devDependencies['@typescript-eslint/parser'] = '8.58.2';
    packageJson.devDependencies['typescript-eslint'] = '8.58.2';
    packageJson.devDependencies.ttsc = '0.20.0';
    writeJson(packageJsonPath, packageJson);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `package.json must declare devDependencies.eslint="${FORMATTING_TOOLCHAIN_POLICY.eslintVersion}", found "9.0.0".`,
    );
    expect(result.errors).toContain(
      'package.json must not declare devDependencies["@typescript-eslint/parser"]; TypeScript linting is owned by @ttsc/lint.',
    );
    expect(result.errors).toContain(
      'package.json must not declare devDependencies["typescript-eslint"]; TypeScript linting is owned by @ttsc/lint.',
    );
    expect(result.errors).toContain(
      `package.json must declare devDependencies.ttsc="${FORMATTING_TOOLCHAIN_POLICY.ttscVersion}", found "0.20.0".`,
    );
  });

  test('fails when ci:local or the lint workflow omits formatting gates', () => {
    const repoRoot = createFormattingPolicyRepo();
    const packageJsonPath = path.join(repoRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.scripts['ci:local'] = 'bun run lint:all';
    writeJson(packageJsonPath, packageJson);

    writeText(
      path.join(repoRoot, '.github/workflows/ci.yml'),
      'jobs:\n  lint:\n    steps:\n      - name: Validate formatting toolchain policy\n        run: bun run formatting-policy:validate\n',
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'package.json must include "bun run formatting-policy:validate" in scripts["ci:local"].',
    );
    expect(result.errors).toContain(
      'package.json must include "bun run format:check" in scripts["ci:local"].',
    );
    expect(result.errors).toContain(
      'package.json must include "bun run typecheck" in scripts["ci:local"].',
    );
    expect(result.errors).toContain(
      '.github/workflows/ci.yml lint job must include "run: bun run format:check".',
    );
    expect(result.errors).toContain(
      '.github/workflows/ci.yml lint job must include "run: bun run typecheck".',
    );
  });

  test('fails when root autofix commands drift from the documented baseline', () => {
    const repoRoot = createFormattingPolicyRepo();
    const packageJsonPath = path.join(repoRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.scripts['lint:fix'] = 'eslint . --fix';
    packageJson.scripts['format:write'] = 'prettier --write .';
    writeJson(packageJsonPath, packageJson);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `package.json must keep scripts["lint:fix"]="${FORMATTING_TOOLCHAIN_POLICY.rootLintFixScript}", found "eslint . --fix".`,
    );
    expect(result.errors).toContain(
      `package.json must keep scripts["format:write"]="${FORMATTING_TOOLCHAIN_POLICY.rootFormatWriteScript}", found "prettier --write .".`,
    );
  });

  test('fails when the read-only ttsc gate drifts', () => {
    const repoRoot = createFormattingPolicyRepo();
    const packageJsonPath = path.join(repoRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.scripts.typecheck = 'typescript --noEmit';
    writeJson(packageJsonPath, packageJson);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `package.json must keep scripts.typecheck="${FORMATTING_TOOLCHAIN_POLICY.rootTypecheckScript}", found "typescript --noEmit".`,
    );
  });

  test('parses the ttsc lint config instead of accepting matching comments', () => {
    const repoRoot = createFormattingPolicyRepo();
    writeText(
      path.join(repoRoot, 'lint.config.ts'),
      `// severity: 'error'; printWidth: 80; no-var: error
export default {
  format: {
    severity: 'warning',
  },
};
`,
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.startsWith(
          'lint.config.ts must export the documented @ttsc/lint configuration;',
        ),
      ),
    ).toBe(true);
  });

  test('fails when an independently runnable example lacks its ttsc lint config', () => {
    const repoRoot = createFormattingPolicyRepo();
    const relativePath = 'examples/my-typia-block/lint.config.mts';
    fs.rmSync(path.join(repoRoot, relativePath));

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `${relativePath} must exist so the example remains independently runnable with @ttsc/lint.`,
    );
  });

  test('fails when a WordPress example loses its local Prettier contract', () => {
    const repoRoot = createFormattingPolicyRepo();
    const configPath = 'examples/my-typia-block/prettier.config.mjs';
    const ignorePath = 'examples/my-typia-block/.prettierignore';
    fs.rmSync(path.join(repoRoot, configPath));
    writeText(path.join(repoRoot, ignorePath), '**/node_modules/**\n');

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.startsWith(configPath))).toBe(
      true,
    );
    expect(result.errors.some((error) => error.startsWith(ignorePath))).toBe(
      true,
    );
  });

  test('rejects malformed ttsc lint config syntax', () => {
    const repoRoot = createFormattingPolicyRepo();
    writeText(
      path.join(repoRoot, 'lint.config.ts'),
      `export default {
  format: {
    severity: 'error',
  },
`,
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.startsWith(
          'lint.config.ts must export a statically readable @ttsc/lint configuration:',
        ),
      ),
    ).toBe(true);
  });

  test('does not reject an explanatory TypeScript ESLint comment', () => {
    const repoRoot = createFormattingPolicyRepo();
    writeText(
      path.join(repoRoot, 'eslint.config.mjs'),
      '// @typescript-eslint is intentionally not used here.\nexport default [];\n',
    );

    expect(validateFormattingToolchainPolicy(repoRoot)).toEqual({
      errors: [],
      valid: true,
    });
  });

  test('rejects malformed ESLint config syntax', () => {
    const repoRoot = createFormattingPolicyRepo();
    writeText(
      path.join(repoRoot, 'eslint.config.mjs'),
      'export default [{ files: ["**/*.js"] };\n',
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.startsWith(
          'eslint.config.mjs must be statically inspectable:',
        ),
      ),
    ).toBe(true);
  });

  test('accepts equivalent ttsc lint config property ordering', () => {
    const repoRoot = createFormattingPolicyRepo();
    const policy = FORMATTING_TOOLCHAIN_POLICY.ttscLintConfig;
    writeText(
      path.join(repoRoot, 'lint.config.ts'),
      `export default ${JSON.stringify(
        {
          rules: policy.rules,
          format: {
            jsDoc: policy.format.jsDoc,
            sortImports: policy.format.sortImports,
            endOfLine: policy.format.endOfLine,
            trailingComma: policy.format.trailingComma,
            singleQuote: policy.format.singleQuote,
            semi: policy.format.semi,
            useTabs: policy.format.useTabs,
            tabWidth: policy.format.tabWidth,
            printWidth: policy.format.printWidth,
            severity: policy.format.severity,
          },
          ignores: policy.ignores,
        },
        null,
        2,
      )};\n`,
    );

    expect(validateFormattingToolchainPolicy(repoRoot)).toEqual({
      errors: [],
      valid: true,
    });
  });

  test('rejects an actual TypeScript ESLint import or TS file scope', () => {
    const repoRoot = createFormattingPolicyRepo();
    writeText(
      path.join(repoRoot, 'eslint.config.mjs'),
      `import tseslint from "typescript-eslint";
const typedFiles = ["**/*.{ts,tsx}"];
export default [{ files: typedFiles, plugins: { "@typescript-eslint": tseslint } }];
`,
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'eslint.config.mjs must keep TypeScript outside the ESLint scope; @ttsc/lint owns TS/TSX.',
    );
  });

  test('rejects a TypeScript ESLint re-export', () => {
    const repoRoot = createFormattingPolicyRepo();
    writeText(
      path.join(repoRoot, 'eslint.config.mjs'),
      'export { default } from "@typescript-eslint/eslint-plugin";\n',
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'eslint.config.mjs must keep TypeScript outside the ESLint scope; @ttsc/lint owns TS/TSX.',
    );
  });

  test('reports non-static ESLint config properties without throwing', () => {
    const repoRoot = createFormattingPolicyRepo();
    writeText(
      path.join(repoRoot, 'eslint.config.mjs'),
      'const key = "files";\nexport default [{ [key]: ["**/*.js"] }];\n',
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.startsWith(
          'eslint.config.mjs must be statically inspectable:',
        ),
      ),
    ).toBe(true);
  });

  test('fails when example or generated package manifests keep a stale prettier version', () => {
    const repoRoot = createFormattingPolicyRepo();
    const exampleManifestPath = path.join(repoRoot, 'examples/my-typia-block/package.json');
    const examplePackageJson = JSON.parse(fs.readFileSync(exampleManifestPath, 'utf8'));
    examplePackageJson.devDependencies.prettier = '2.8.8';
    writeJson(exampleManifestPath, examplePackageJson);

    const templateManifestPath = path.join(
      repoRoot,
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache',
    );
    writeText(
      templateManifestPath,
      '{\n  "devDependencies": {\n    "prettier": "2.8.8"\n  }\n}\n',
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `examples/my-typia-block/package.json must declare devDependencies.prettier="${FORMATTING_TOOLCHAIN_POLICY.prettierVersion}", found "2.8.8".`,
    );
    expect(result.errors).toContain(
      `packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache must declare devDependencies.prettier="${FORMATTING_TOOLCHAIN_POLICY.prettierVersion}", found "2.8.8".`,
    );
  });

  test('reports unreadable and malformed generated manifests without throwing', () => {
    const repoRoot = createFormattingPolicyRepo();
    const missingManifestPath =
      'packages/create-workspace-template/package.json.mustache';
    const malformedManifestPath =
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache';
    fs.rmSync(path.join(repoRoot, missingManifestPath));
    writeText(path.join(repoRoot, malformedManifestPath), '{ invalid json\n');

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    for (const relativePath of [
      missingManifestPath,
      malformedManifestPath,
    ]) {
      expect(
        result.errors.some((error) =>
          error.startsWith(
            `${relativePath} must be a readable valid JSON generated package manifest:`,
          ),
        ),
      ).toBe(true);
    }
  });

  test('fails when example or generated manifests reintroduce TypeScript ESLint', () => {
    const repoRoot = createFormattingPolicyRepo();
    const exampleManifestPath = path.join(
      repoRoot,
      'examples/my-typia-block/package.json',
    );
    const examplePackageJson = JSON.parse(
      fs.readFileSync(exampleManifestPath, 'utf8'),
    );
    examplePackageJson.devDependencies['typescript-eslint'] = '8.58.2';
    writeJson(exampleManifestPath, examplePackageJson);

    const templateManifestPath = path.join(
      repoRoot,
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache',
    );
    const templatePackageJson = JSON.parse(
      fs.readFileSync(templateManifestPath, 'utf8'),
    );
    templatePackageJson.devDependencies['@typescript-eslint/parser'] =
      '8.58.2';
    writeJson(templateManifestPath, templatePackageJson);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'examples/my-typia-block/package.json must not declare devDependencies["typescript-eslint"]; TypeScript linting is owned by @ttsc/lint.',
    );
    expect(result.errors).toContain(
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache must not declare devDependencies["@typescript-eslint/parser"]; TypeScript linting is owned by @ttsc/lint.',
    );
  });

  test('fails when WordPress example check commands drift or reintroduce lint aliases', () => {
    const repoRoot = createFormattingPolicyRepo();
    const exampleManifestPath = path.join(
      repoRoot,
      'examples/my-typia-block/package.json',
    );
    const examplePackageJson = JSON.parse(
      fs.readFileSync(exampleManifestPath, 'utf8'),
    );
    examplePackageJson.scripts['check:code'] = 'ttsc --noEmit';
    examplePackageJson.scripts['lint:js'] = 'wp-scripts lint-js';
    writeJson(exampleManifestPath, examplePackageJson);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `examples/my-typia-block/package.json must keep scripts["check:code"]="${FORMATTING_TOOLCHAIN_POLICY.exampleCodeCheckScript}", found "ttsc --noEmit".`,
    );
    expect(result.errors).toContain(
      'examples/my-typia-block/package.json must not define the legacy scripts.lint:js; examples expose check:code and check instead.',
    );
  });

  test('fails when WordPress example check skips the format lane', () => {
    const repoRoot = createFormattingPolicyRepo();
    const exampleManifestPath = path.join(
      repoRoot,
      'examples/my-typia-block/package.json',
    );
    const examplePackageJson = JSON.parse(
      fs.readFileSync(exampleManifestPath, 'utf8'),
    );
    examplePackageJson.scripts.check =
      'bun run check:code && bun run check:style';
    writeJson(exampleManifestPath, examplePackageJson);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `examples/my-typia-block/package.json must keep scripts.check="${FORMATTING_TOOLCHAIN_POLICY.exampleCheckScript}", found "bun run check:code && bun run check:style".`,
    );
  });

  test('fails when a generated template reintroduces the legacy ESLint island', () => {
    const repoRoot = createFormattingPolicyRepo();
    const templateManifestPath = path.join(
      repoRoot,
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache',
    );
    const templateManifest = JSON.parse(
      fs.readFileSync(templateManifestPath, 'utf8'),
    );
    templateManifest.devDependencies['@typescript/typescript6'] = '6.0.2';
    templateManifest.devDependencies['eslint-import-resolver-typescript'] =
      '^4.4.5';
    templateManifest.scripts['lint:js'] = 'wp-scripts lint-js';
    writeJson(templateManifestPath, templateManifest);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache must not declare devDependencies["@typescript/typescript6"]; ttsc check owns generated JavaScript and TypeScript diagnostics without the legacy ESLint compatibility island.',
    );
    expect(result.errors).toContain(
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache must not declare devDependencies["eslint-import-resolver-typescript"]; ttsc check owns generated JavaScript and TypeScript diagnostics without the legacy ESLint compatibility island.',
    );
    expect(result.errors).toContain(
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache must not define the legacy scripts.lint:js; generated projects expose check:code and check instead.',
    );
  });

  test('fails when a generated template omits ttsc check --noEmit', () => {
    const repoRoot = createFormattingPolicyRepo();
    const templateManifestPath = path.join(
      repoRoot,
      'packages/create-workspace-template/package.json.mustache',
    );
    const templateManifest = JSON.parse(
      fs.readFileSync(templateManifestPath, 'utf8'),
    );
    templateManifest.scripts['check:code'] = 'bun run sync --check';
    writeJson(templateManifestPath, templateManifest);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `packages/create-workspace-template/package.json.mustache must keep scripts["check:code"]="${FORMATTING_TOOLCHAIN_POLICY.generatedCodeCheckScript}", found "bun run sync --check".`,
    );
  });

  test('fails when a generated template relies on transitive React hoisting', () => {
    const repoRoot = createFormattingPolicyRepo();
    const templateManifestPath = path.join(
      repoRoot,
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache',
    );
    const templateManifest = JSON.parse(
      fs.readFileSync(templateManifestPath, 'utf8'),
    );
    delete templateManifest.devDependencies.react;
    delete templateManifest.devDependencies['react-dom'];
    writeJson(templateManifestPath, templateManifest);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache must declare devDependencies["react"]="^18.3.1", found null.',
    );
    expect(result.errors).toContain(
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache must declare devDependencies["react-dom"]="^18.3.1", found null.',
    );
  });

  test('fails when a generated template adds a TypeScript import resolver', () => {
    const repoRoot = createFormattingPolicyRepo();
    const templateManifestPath = path.join(
      repoRoot,
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache',
    );
    const templateManifest = JSON.parse(
      fs.readFileSync(templateManifestPath, 'utf8'),
    );
    templateManifest.devDependencies['eslint-import-resolver-typescript'] =
      '^4.4.5';
    writeJson(templateManifestPath, templateManifest);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache must not declare devDependencies["eslint-import-resolver-typescript"]; ttsc check owns generated JavaScript and TypeScript diagnostics without the legacy ESLint compatibility island.',
    );
  });

  test('fails when generated JavaScript formatting drifts from WordPress ESLint', () => {
    const repoRoot = createFormattingPolicyRepo();
    const configPath = path.join(
      repoRoot,
      'packages/wp-typia-project-tools/templates/_shared/base/prettier.config.mjs.mustache',
    );
    writeText(configPath, 'export default { useTabs: false };\n');

    const result = validateFormattingToolchainPolicy(repoRoot);
    const errors = result.errors.join('\n');

    expect(result.valid).toBe(false);
    expect(errors).toContain(
      'packages/wp-typia-project-tools/templates/_shared/base/prettier.config.mjs.mustache must match the generated WordPress JavaScript Prettier policy;',
    );
    expect(errors).toContain('found {"useTabs":false}');
    expect(errors).toContain('expected {"useTabs":true');
  });

  test('fails when generated format scripts split formatting ownership', () => {
    const repoRoot = createFormattingPolicyRepo();
    const templateManifestPath = path.join(
      repoRoot,
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache',
    );
    const templateManifest = JSON.parse(
      fs.readFileSync(templateManifestPath, 'utf8'),
    );
    templateManifest.scripts.format =
      'ttsc format --singleThreaded && prettier --write "**/*.{js,json}"';
    writeJson(templateManifestPath, templateManifest);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache must keep scripts.format="${FORMATTING_TOOLCHAIN_POLICY.generatedWpScriptsFormatScript}" so Prettier remains the single generated-project formatter, found "ttsc format --singleThreaded && prettier --write \\"**/*.{js,json}\\"".`,
    );
  });

  test('fails when generated style lint rejects an empty workspace', () => {
    const repoRoot = createFormattingPolicyRepo();
    const templateManifestPath = path.join(
      repoRoot,
      'packages/create-workspace-template/package.json.mustache',
    );
    const templateManifest = JSON.parse(
      fs.readFileSync(templateManifestPath, 'utf8'),
    );
    templateManifest.scripts['check:style'] = 'wp-scripts lint-style';
    writeJson(templateManifestPath, templateManifest);

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'packages/create-workspace-template/package.json.mustache must keep scripts["check:style"]="wp-scripts lint-style --allow-empty-input" so empty workspaces remain checkable, found "wp-scripts lint-style".',
    );
  });

  test('fails when a generated template moves prettier out of devDependencies', () => {
    const repoRoot = createFormattingPolicyRepo();
    const templateManifestPath = path.join(
      repoRoot,
      'packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache',
    );

    writeText(
      templateManifestPath,
      `{\n  "scripts": {\n    "check:code": "${FORMATTING_TOOLCHAIN_POLICY.generatedCodeCheckScript}"\n  },\n  "dependencies": {\n    "prettier": "3.8.2"\n  },\n  "devDependencies": {}\n}\n`,
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      `packages/wp-typia-project-tools/templates/_shared/base/package.json.mustache must declare devDependencies.prettier="${FORMATTING_TOOLCHAIN_POLICY.prettierVersion}".`,
    );
  });

  test('fails when another workflow job satisfies the lint gate strings accidentally', () => {
    const repoRoot = createFormattingPolicyRepo();

    writeText(
      path.join(repoRoot, '.github/workflows/ci.yml'),
      `jobs:\n  lint:\n    steps:\n      - name: Validate pending changesets\n        run: bun run changesets:validate\n  format-check:\n    steps:\n      - name: Validate formatting toolchain policy\n        run: bun run formatting-policy:validate\n      - name: Run formatting check\n        run: bun run format:check\n`,
    );

    const result = validateFormattingToolchainPolicy(repoRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      '.github/workflows/ci.yml lint job must include "run: bun run formatting-policy:validate".',
    );
    expect(result.errors).toContain(
      '.github/workflows/ci.yml lint job must include "run: bun run format:check".',
    );
  });
});
