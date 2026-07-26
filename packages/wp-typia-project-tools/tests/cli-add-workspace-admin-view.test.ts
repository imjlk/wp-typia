import { expect, test } from 'bun:test';

import {
  assertAdminViewPackageAvailability,
  parseAdminViewSource,
} from '../src/runtime/cli-add-workspace-admin-view-source.js';
import {
  buildAdminViewConfigSource,
  buildAdminViewTypesSource,
} from '../src/runtime/cli-add-workspace-admin-view-templates.js';
import { buildCoreDataAdminViewConfigSource } from '../src/runtime/cli-add-workspace-admin-view-templates-core-data.js';
import {
  buildAdminViewScreenSource,
  buildDefaultAdminViewConfigSource,
  buildDefaultAdminViewDataSource,
} from '../src/runtime/cli-add-workspace-admin-view-templates-default.js';
import {
  buildRestAdminViewConfigSource,
  buildRestAdminViewDataSource,
  buildRestAdminViewTypesSource,
} from '../src/runtime/cli-add-workspace-admin-view-templates-rest.js';
import {
  buildRestSettingsAdminViewConfigSource,
  buildRestSettingsAdminViewScreenSource,
} from '../src/runtime/cli-add-workspace-admin-view-templates-settings.js';
import {
  type AdminViewCoreDataSource,
  type AdminViewManualSettingsRestResource,
  type AdminViewRestResource,
} from '../src/runtime/cli-add-workspace-admin-view-types.js';
import {
  toCamelCase,
  toPascalCase,
} from '../src/runtime/shared/string-case.js';

test('admin-view source parsing accepts supported rest-resource and core-data locators', () => {
  expect(parseAdminViewSource()).toBeUndefined();
  expect(parseAdminViewSource('rest-resource:orders')).toEqual({
    kind: 'rest-resource',
    slug: 'orders',
  });
  expect(parseAdminViewSource('core-data:taxonomy/category')).toEqual({
    entityKind: 'taxonomy',
    entityName: 'category',
    kind: 'core-data',
  });
});

test('admin-view source parsing rejects malformed or unsupported core-data locators', () => {
  expect(() => parseAdminViewSource('core-data:root/plugin')).toThrow(
    'Admin view core-data sources currently support only: postType, taxonomy.',
  );
  expect(() => parseAdminViewSource('rest-resource')).toThrow(
    'Admin view source must use `rest-resource:<slug>` or `core-data:<kind>/<name>`.',
  );
});

test('admin-view package availability allows public npm installs', () => {
  expect(() => assertAdminViewPackageAvailability()).not.toThrow();
});

test(
  'admin-view template builders emit rest-resource imports and taxonomy-specific config',
  () => {
  const restResource: AdminViewRestResource = {
    apiFile: 'src/rest/orders/api.ts',
    clientFile: 'src/rest/orders/client.ts',
    dataFile: 'src/rest/orders/data.ts',
    methods: ['list', 'read'],
    namespace: 'demo/v1',
    openApiFile: 'src/rest/orders/openapi.json',
    phpFile: 'inc/rest/orders.php',
    slug: 'orders',
    typesFile: 'src/rest/orders/types.ts',
    validatorsFile: 'src/rest/orders/validators.ts',
  };
  const taxonomySource: AdminViewCoreDataSource = {
    entityKind: 'taxonomy',
    entityName: 'category',
    kind: 'core-data',
  };

  const restTypesSource = buildAdminViewTypesSource(
    'snapshots',
    restResource,
    undefined,
  );
  const taxonomyConfigSource = buildAdminViewConfigSource(
    'categories',
    'demo-space',
    taxonomySource,
    undefined,
  );

  expect(restTypesSource).toContain(
    "import type { OrdersRecord } from '../../rest/orders/types';",
  );
  expect(restTypesSource).toContain(
    'export type SnapshotsAdminViewItem = OrdersRecord;',
  );
  expect(taxonomyConfigSource).toContain("titleField: 'name'");
  expect(taxonomyConfigSource).toContain(
    'defineDataViews<CategoriesAdminViewItem>',
  );
  expect(taxonomyConfigSource).toContain(
    "label: __('Count', 'demo-space')",
  );
  },
);

test('admin-view template barrel delegates to focused variant emitters', () => {
  const restResource: AdminViewRestResource = {
    apiFile: 'src/rest/orders/api.ts',
    clientFile: 'src/rest/orders/client.ts',
    dataFile: 'src/rest/orders/data.ts',
    methods: ['list', 'read'],
    namespace: 'demo/v1',
    openApiFile: 'src/rest/orders/openapi.json',
    phpFile: 'inc/rest/orders.php',
    slug: 'orders',
    typesFile: 'src/rest/orders/types.ts',
    validatorsFile: 'src/rest/orders/validators.ts',
  };
  const taxonomySource: AdminViewCoreDataSource = {
    entityKind: 'taxonomy',
    entityName: 'category',
    kind: 'core-data',
  };

  expect(buildAdminViewTypesSource('snapshots', restResource, undefined)).toBe(
    buildRestAdminViewTypesSource('snapshots', restResource),
  );
  expect(
    buildAdminViewConfigSource('starter', 'demo-space', undefined, undefined),
  ).toBe(buildDefaultAdminViewConfigSource('starter', 'demo-space'));
  expect(
    buildAdminViewConfigSource(
      'categories',
      'demo-space',
      taxonomySource,
      undefined,
    ),
  ).toBe(
    buildCoreDataAdminViewConfigSource(
      'categories',
      'demo-space',
      taxonomySource,
    ),
  );
});

test('core-data admin-view config labels post title fields as title', () => {
  const postTypeSource: AdminViewCoreDataSource = {
    entityKind: 'postType',
    entityName: 'post',
    kind: 'core-data',
  };

  expect(
    buildCoreDataAdminViewConfigSource('posts', 'demo-space', postTypeSource),
  ).toContain("label: __('Title', 'demo-space')");
});

test('admin-view emitters preformat breakable long TypeScript constructs', () => {
  const normalizeGeneratedSource = (source: string): string =>
    source.replace(/^[ \t]+/gmu, (indentation) =>
      indentation.replace(/\t/gu, '  '),
    );
  const adminViewSlug = `admin-${'a'.repeat(12)}`;
  const textDomain = `text-${'d'.repeat(64)}`;
  const pascalName = toPascalCase(adminViewSlug);
  const camelName = toCamelCase(adminViewSlug);
  const dataSetTypeName = `${pascalName}AdminViewDataSet`;
  const itemTypeName = `${pascalName}AdminViewItem`;
  const dataViewsName = `${camelName}AdminDataViews`;
  const restResource: AdminViewRestResource = {
    apiFile: 'src/rest/orders/api.ts',
    clientFile: 'src/rest/orders/client.ts',
    dataFile: 'src/rest/orders/data.ts',
    methods: ['list', 'read'],
    namespace: 'demo/v1',
    openApiFile: 'src/rest/orders/openapi.json',
    phpFile: 'inc/rest/orders.php',
    slug: 'orders',
    typesFile: 'src/rest/orders/types.ts',
    validatorsFile: 'src/rest/orders/validators.ts',
  };
  const manualRestResource: AdminViewManualSettingsRestResource = {
    ...restResource,
    bodyTypeName: 'OrdersSettingsRequest',
    mode: 'manual',
    queryTypeName: 'OrdersSettingsQuery',
    responseTypeName: 'OrdersSettingsResponse',
  };
  const defaultConfig = normalizeGeneratedSource(
    buildDefaultAdminViewConfigSource(adminViewSlug, textDomain),
  );
  const defaultData = normalizeGeneratedSource(
    buildDefaultAdminViewDataSource(adminViewSlug),
  );
  const defaultScreen = normalizeGeneratedSource(
    buildAdminViewScreenSource(adminViewSlug, textDomain),
  );
  const restConfig = normalizeGeneratedSource(
    buildRestAdminViewConfigSource(adminViewSlug, textDomain),
  );
  const restData = normalizeGeneratedSource(
    buildRestAdminViewDataSource(adminViewSlug, restResource),
  );
  const settingsConfig = normalizeGeneratedSource(
    buildRestSettingsAdminViewConfigSource(
      adminViewSlug,
      textDomain,
      manualRestResource,
    ),
  );
  const settingsScreen = normalizeGeneratedSource(
    buildRestSettingsAdminViewScreenSource(adminViewSlug, textDomain),
  );

  for (const configSource of [defaultConfig, restConfig]) {
    expect(configSource).toContain(
      `    searchLabel: __(\n      'Search records',\n      '${textDomain}',\n    ),`,
    );
  }
  expect(settingsConfig).toContain(
    '  description: __(\n' +
      "    'This generated settings form is backed by the orders REST contract. " +
      "Adjust config.ts and data.ts as the contract becomes product-specific.',\n" +
      `    '${textDomain}',\n` +
      '  ),',
  );
  expect(defaultConfig).toContain(
    `export const ${dataViewsName} =\n` +
      `  defineDataViews<${itemTypeName}>({`,
  );
  expect(defaultData).toContain(
    'import type {\n' +
      `  ${dataSetTypeName},\n` +
      `  ${itemTypeName},\n` +
      "} from './types';",
  );
  expect(defaultData).toContain(
    `const query = ${dataViewsName}.` +
      `toQueryArgs<${pascalName}AdminViewQuery>(\n` +
      '    view,',
  );
  expect(defaultScreen).toContain(
    'import type {\n' +
      `  ${dataSetTypeName},\n` +
      `  ${itemTypeName},\n` +
      "} from './types';",
  );
  expect(restData).toContain(
    `const query = ${dataViewsName}.` +
      'toQueryArgs<OrdersListQuery>(\n' +
      '    view,',
  );
  expect(settingsScreen).toContain(
    'import type {\n' +
      `  ${pascalName}SettingsFormState,\n` +
      `  ${pascalName}SettingsResponse,\n` +
      "} from './types';",
  );
});
