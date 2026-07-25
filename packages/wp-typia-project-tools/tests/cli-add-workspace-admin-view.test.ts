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
import { buildDefaultAdminViewConfigSource } from '../src/runtime/cli-add-workspace-admin-view-templates-default.js';
import { buildRestAdminViewTypesSource } from '../src/runtime/cli-add-workspace-admin-view-templates-rest.js';
import {
  type AdminViewCoreDataSource,
  type AdminViewRestResource,
} from '../src/runtime/cli-add-workspace-admin-view-types.js';

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

test('admin-view template builders emit rest-resource imports and taxonomy-specific config', () => {
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
    'import type { OrdersRecord } from "../../rest/orders/types";',
  );
  expect(restTypesSource).toContain(
    'export type SnapshotsAdminViewItem = OrdersRecord;',
  );
  expect(taxonomyConfigSource).toContain("titleField: 'name'");
  expect(taxonomyConfigSource).toContain(
    'defineDataViews<CategoriesAdminViewItem>',
  );
  expect(taxonomyConfigSource).toContain('label: __( \'Count\', "demo-space" )');
});

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
  ).toContain('label: __( \'Title\', "demo-space" )');
});
