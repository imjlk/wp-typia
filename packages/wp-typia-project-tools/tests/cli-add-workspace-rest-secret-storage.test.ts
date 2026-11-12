import { afterAll, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { runAddRestResourceCommand } from '../src/runtime/add/cli-add-workspace-rest.js';
import {
  buildManualRestContractConfigEntry,
  buildManualRestContractTypesSource,
  buildManualRestSecretStoragePhpSource,
} from '../src/runtime/cli-add-workspace-rest-source-emitters.js';
import { ensureManualRestSecretStorageConfigField } from '../src/runtime/workspace/workspace-inventory-mutations.js';
import { readWorkspaceInventory } from '../src/runtime/workspace-inventory.js';
import {
  cleanupScaffoldTempRoot,
  createScaffoldTempRoot,
  linkWorkspaceNodeModules,
  scaffoldOfficialWorkspace,
  typecheckGeneratedProject,
} from './helpers/scaffold-test-harness.js';

const secretConfig = {
  auth: 'public' as const,
  bodyTypeName: 'IntegrationSettingsRequest',
  method: 'POST' as const,
  namespace: 'demo-space/v1',
  pathPattern: '/integration-settings',
  queryTypeName: 'IntegrationSettingsQuery',
  responseTypeName: 'IntegrationSettingsResponse',
  restResourceSlug: 'integration-settings',
  secretFieldName: 'apiKey',
  secretPreserveOnEmpty: true,
  secretStateFieldName: 'hasApiKey',
};

test('default manual REST secret config stays on the option path', () => {
  const omitted = buildManualRestContractConfigEntry(secretConfig);
  const optionStorage = buildManualRestContractConfigEntry({
    ...secretConfig,
    secretStorage: 'option',
  });

  expect(optionStorage).toBe(omitted);
  expect(omitted).not.toContain('secretStorage');
  expect(omitted).not.toContain('wp_set_secret');
  expect(omitted).toContain("secretFieldName: 'apiKey'");
  expect(omitted).toContain('secretPreserveOnEmpty: true');

  const typesSource = buildManualRestContractTypesSource({
    bodyTypeName: secretConfig.bodyTypeName,
    queryTypeName: secretConfig.queryTypeName,
    responseTypeName: secretConfig.responseTypeName,
    restResourceSlug: secretConfig.restResourceSlug,
    secretFieldName: secretConfig.secretFieldName,
    secretPreserveOnEmpty: true,
    secretStateFieldName: secretConfig.secretStateFieldName,
  });
  expect(typesSource).toContain('hasApiKey: boolean;');
  expect(typesSource).not.toContain('apiKey: boolean');
  expect(typesSource).not.toContain('apiKey: string');
});

test('secrets-api helper guards WordPress secret functions and does not echo the secret', () => {
  const source = buildManualRestSecretStoragePhpSource({
    phpPrefix: 'demo_space',
    preserveOnEmpty: true,
    restResourceSlug: 'integration-settings',
    secretFieldName: 'apiKey',
    secretStateFieldName: 'hasApiKey',
    textDomain: 'demo-space',
  });
  const hasBody = source.slice(
    source.indexOf('function demo_space_integration_settings_has_secret'),
    source.indexOf('function demo_space_integration_settings_secret_state'),
  );
  const stateBody = source.slice(
    source.indexOf('function demo_space_integration_settings_secret_state'),
  );

  expect(source).toContain("function_exists( 'wp_set_secret' )");
  expect(source).toContain("function_exists( 'wp_get_secret' )");
  expect(source).toContain("function_exists( 'wp_delete_secret' )");
  expect(source).toContain('update_option(');
  expect(source).toContain('get_option(');
  expect(source).toContain('delete_option(');
  expect(source).toContain("'demo-space/integration-settings-api-key'");
  expect(source).toContain("'demo_space_integration_settings_api_key'");
  expect(source).toContain('return true === $stored;');
  expect(source).toContain('->reveal()');
  expect(source).not.toMatch(
    /\b(echo|print|printf|var_dump|var_export|error_log|wp_send_json)\b/u,
  );
  expect(source).not.toContain("'apiKey'");
  expect(source).not.toContain('"apiKey"');
  expect(hasBody).not.toContain('reveal');
  expect(hasBody).toContain('null !== $secret');
  expect(stateBody).toContain("'hasApiKey' => demo_space_integration_settings_has_secret()");
  expect(stateBody).not.toContain('reveal');
  expect(stateBody).not.toContain('api_key');

  const clearing = buildManualRestSecretStoragePhpSource({
    phpPrefix: 'demo_space',
    preserveOnEmpty: false,
    restResourceSlug: 'integration-settings',
    secretFieldName: 'apiKey',
    secretStateFieldName: 'hasApiKey',
    textDomain: 'demo-space',
  });
  expect(clearing).toContain(
    'return demo_space_integration_settings_delete_secret();',
  );
  expect(
    buildManualRestContractConfigEntry({
      ...secretConfig,
      secretStorage: 'secrets-api',
    }),
  ).toContain("secretStorage: 'secrets-api'");
});

test('secret storage config field is added only by the secrets-api helper', () => {
  const source = `export interface WorkspaceRestResourceBaseConfig {
  secretStateFieldName?: string;
  slug: string;
}

export interface WorkspaceRestResourceConfig {
  secretStateFieldName?: string;
  slug: string;
}
`;
  const updated = ensureManualRestSecretStorageConfigField(source);

  expect(updated).toContain("secretStorage?: 'option' | 'secrets-api';");
  expect(updated.indexOf('secretStateFieldName')).toBeLessThan(
    updated.indexOf('secretStorage'),
  );
  expect(updated.match(/secretStorage\?:/gu)?.length).toBe(2);
  expect(ensureManualRestSecretStorageConfigField(updated)).toBe(updated);
});

test('runAddRestResourceCommand rejects secret storage before touching a workspace', async () => {
  await expect(
    runAddRestResourceCommand({
      cwd: '/tmp/wp-typia-missing-secret-storage-workspace',
      manual: false,
      restResourceName: 'integration-settings',
      secretFieldName: 'apiKey',
      secretStorage: 'secrets-api',
    }),
  ).rejects.toThrow(
    'Manual REST contract --secret-storage requires --manual and --secret-field.',
  );
  await expect(
    runAddRestResourceCommand({
      cwd: '/tmp/wp-typia-missing-secret-storage-workspace',
      manual: true,
      restResourceName: 'integration-settings',
      secretStorage: 'option',
    }),
  ).rejects.toThrow(
    'Manual REST contract --secret-storage requires --secret-field.',
  );
  await expect(
    runAddRestResourceCommand({
      cwd: '/tmp/wp-typia-missing-secret-storage-workspace',
      manual: true,
      restResourceName: 'integration-settings',
      secretFieldName: 'apiKey',
      secretStorage: 'vault' as 'option',
    }),
  ).rejects.toThrow(
    'Manual REST contract --secret-storage must be option or secrets-api.',
  );
});

const tempRoot = createScaffoldTempRoot('wp-typia-secret-storage-');

afterAll(() => {
  cleanupScaffoldTempRoot(tempRoot);
});

test('manual REST scaffolds keep option storage by default and guard secrets-api output', async () => {
  const targetDir = path.join(tempRoot, 'demo-secret-storage');
  await scaffoldOfficialWorkspace(targetDir, {
    description: 'Secret storage scaffold',
    slug: 'demo-secret-storage',
    title: 'Demo Secret Storage',
  });
  linkWorkspaceNodeModules(targetDir);

  const bootstrapPath = path.join(targetDir, 'demo-secret-storage.php');
  const bootstrapBefore = fs.readFileSync(bootstrapPath, 'utf8');

  await runAddRestResourceCommand({
    cwd: targetDir,
    manual: true,
    method: 'POST',
    restResourceName: 'external-record',
    secretFieldName: 'apiKey',
  });
  await runAddRestResourceCommand({
    cwd: targetDir,
    manual: true,
    method: 'POST',
    restResourceName: 'external-token',
    secretFieldName: 'apiKey',
    secretStorage: 'option',
  });

  const bootstrapAfterOption = fs.readFileSync(bootstrapPath, 'utf8');
  expect(bootstrapAfterOption).toBe(bootstrapBefore);
  expect(bootstrapAfterOption).not.toContain('wp_set_secret');
  for (const slug of ['external-record', 'external-token']) {
    expect(
      fs.existsSync(path.join(targetDir, 'inc', 'rest', `${slug}.php`)),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(targetDir, 'inc', 'rest', `${slug}-secret.php`)),
    ).toBe(false);
    const typesSource = fs.readFileSync(
      path.join(targetDir, 'src', 'rest', slug, 'api-types.ts'),
      'utf8',
    );
    expect(typesSource).toContain('hasApiKey: boolean;');
    expect(typesSource).not.toContain('apiKey: boolean');
    expect(typesSource).not.toContain('apiKey: string');
  }
  expect(fs.readFileSync(path.join(targetDir, 'scripts', 'block-config.ts'), 'utf8')).not.toContain(
    'secretStorage',
  );

  await runAddRestResourceCommand({
    cwd: targetDir,
    manual: true,
    method: 'POST',
    restResourceName: 'integration-settings',
    secretFieldName: 'apiKey',
    secretPreserveOnEmpty: true,
    secretStorage: 'secrets-api',
  });

  const phpPath = path.join(
    targetDir,
    'inc',
    'rest',
    'integration-settings-secret.php',
  );
  const phpSource = fs.readFileSync(phpPath, 'utf8');
  const typesSource = fs.readFileSync(
    path.join(targetDir, 'src', 'rest', 'integration-settings', 'api-types.ts'),
    'utf8',
  );
  const blockConfigSource = fs.readFileSync(
    path.join(targetDir, 'scripts', 'block-config.ts'),
    'utf8',
  );
  const bootstrapSource = fs.readFileSync(bootstrapPath, 'utf8');

  expect(phpSource).toContain("function_exists( 'wp_set_secret' )");
  expect(phpSource).toContain("function_exists( 'wp_get_secret' )");
  expect(phpSource).toContain("function_exists( 'wp_delete_secret' )");
  expect(phpSource).not.toMatch(
    /\b(echo|print|printf|var_dump|var_export|error_log|wp_send_json)\b/u,
  );
  expect(phpSource).not.toContain("'apiKey'");
  expect(typesSource).toContain('hasApiKey: boolean;');
  expect(typesSource).not.toContain('apiKey: boolean');
  expect(typesSource).not.toContain('apiKey: string');
  expect(blockConfigSource).toContain("secretStorage: 'secrets-api'");
  expect(blockConfigSource).toContain(
    "secretStorage?: 'option' | 'secrets-api';",
  );
  expect(bootstrapSource).toContain(
    "require_once __DIR__ . '/inc/rest/integration-settings-secret.php';",
  );
  expect(
    fs.existsSync(
      path.join(targetDir, 'inc', 'rest', 'integration-settings.php'),
    ),
  ).toBe(false);

  const inventory = readWorkspaceInventory(targetDir);
  expect(
    inventory.restResources.find(
      (entry) => entry.slug === 'integration-settings',
    )?.secretStorage,
  ).toBe('secrets-api');
  expect(
    inventory.restResources.find((entry) => entry.slug === 'external-record')
      ?.secretStorage,
  ).toBeUndefined();

  typecheckGeneratedProject(targetDir);
}, 180_000);
