import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import { createStarlightTypeDocPlugin } from 'starlight-typedoc';

import typedocPublicConfig from '../../typedoc.public.json' with { type: 'json' };

const {
  $schema: _schema,
  entryPoints,
  tsconfig,
  ...typeDoc
} = typedocPublicConfig;

const internalEntryPoints = [
  'packages/wp-typia-api-client/src/internal/runtime-primitives.ts',
];

const advancedEntryPoints = [
  'packages/wp-typia-block-runtime/src/identifiers.ts',
  'packages/wp-typia-block-runtime/src/inspector.ts',
  'packages/wp-typia-block-runtime/src/json-utils.ts',
  'packages/wp-typia-block-runtime/src/metadata-analysis.ts',
  'packages/wp-typia-block-runtime/src/metadata-model.ts',
  'packages/wp-typia-block-runtime/src/metadata-parser.ts',
  'packages/wp-typia-block-runtime/src/metadata-php-render.ts',
  'packages/wp-typia-block-runtime/src/metadata-projection.ts',
];

const coreEntryPoints = entryPoints.filter(
  (entryPoint) =>
    !advancedEntryPoints.includes(entryPoint) &&
    !internalEntryPoints.includes(entryPoint),
);

const toResolvedEntryPoints = (points) =>
  points.map((entryPoint) => `../../${entryPoint}`);

const [coreTypeDocPlugin, coreTypeDocSidebarGroup] =
  createStarlightTypeDocPlugin();
const [advancedTypeDocPlugin, advancedTypeDocSidebarGroup] =
  createStarlightTypeDocPlugin();
const [internalTypeDocPlugin, internalTypeDocSidebarGroup] =
  createStarlightTypeDocPlugin();

const sharedTypeDocOptions = {
  tsconfig: `../../${tsconfig}`,
  typeDoc,
};

export default defineConfig({
  site: 'https://imjlk.github.io',
  base: '/wp-typia',
  integrations: [
    starlight({
      title: 'wp-typia',
      description:
        'Type-first WordPress block tooling, runtime contracts, and migration-safe scaffolds.',
      disable404Route: true,
      editLink: {
        baseUrl: 'https://github.com/imjlk/wp-typia/edit/main/apps/docs/',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/imjlk/wp-typia',
        },
      ],
      plugins: [
        coreTypeDocPlugin({
          entryPoints: toResolvedEntryPoints(coreEntryPoints),
          output: 'api',
          sidebar: {
            label: 'Core API',
          },
          ...sharedTypeDocOptions,
        }),
        advancedTypeDocPlugin({
          entryPoints: toResolvedEntryPoints(advancedEntryPoints),
          output: 'api/advanced',
          sidebar: {
            label: 'Advanced Helpers',
          },
          ...sharedTypeDocOptions,
        }),
        internalTypeDocPlugin({
          entryPoints: toResolvedEntryPoints(internalEntryPoints),
          output: 'api/internal',
          sidebar: {
            label: 'Internal APIs',
          },
          ...sharedTypeDocOptions,
        }),
      ],
      sidebar: [
        {
          label: 'Start Here',
          items: [
            { label: 'Overview', link: '/' },
            { label: 'API Overview', link: '/reference/api/' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Architecture Guide', link: '/guides/architecture/' },
            { label: 'Interactivity Guide', link: '/guides/interactivity/' },
            { label: 'Migration Guide', link: '/guides/migrations/' },
            {
              label: 'Nesting Contracts Guide',
              link: '/guides/nesting-contracts/',
            },
            { label: 'Union Support Guide', link: '/guides/union-support/' },
          ],
        },
        {
          label: 'Architecture',
          items: [
            {
              label: 'Block Generator Architecture',
              link: '/architecture/block-generator-architecture/',
            },
            {
              label: 'Block Generator Service',
              link: '/architecture/block-generator-service/',
            },
            {
              label: 'Block Generator Tool Contract',
              link: '/architecture/block-generator-tool-contract/',
            },
            {
              label: 'External Template Layers',
              link: '/architecture/external-template-layer-composition/',
            },
            {
              label: 'Runtime Import Policy',
              link: '/architecture/runtime-import-policy/',
            },
            {
              label: 'Runtime Surface',
              link: '/architecture/runtime-surface/',
            },
          ],
        },
        {
          label: 'Reference',
          items: [
            {
              label: 'CLI Reference',
              link: '/reference/cli/',
            },
            {
              label: 'DataViews Compatibility',
              link: '/reference/dataviews/',
            },
            {
              label: 'Error Export Contracts',
              link: '/reference/error-export-contracts/',
            },
            {
              label: 'WordPress AI Projections',
              link: '/reference/wordpress-ai-projections/',
            },
            {
              label: 'Typia LLM Evaluation',
              link: '/reference/typia-llm-evaluation/',
            },
          ],
        },
        {
          label: 'Tutorials',
          items: [
            {
              label: 'Basic Block Tutorial',
              link: '/tutorials/basic-block-tutorial/',
            },
            {
              label: 'Compound Block Tutorial',
              link: '/tutorials/compound-block-tutorial/',
            },
            {
              label: 'Persistence Block Tutorial',
              link: '/tutorials/persistence-block-tutorial/',
            },
          ],
        },
        {
          label: 'API Reference',
          items: [
            coreTypeDocSidebarGroup,
            advancedTypeDocSidebarGroup,
            internalTypeDocSidebarGroup,
          ],
        },
        {
          label: 'Maintainers',
          items: [
            {
              label: 'Gunshi Runtime Contract',
              link: '/maintainers/bunli-cli-migration/',
            },
            {
              label: 'Gunshi Dispatch RFC',
              link: '/maintainers/gunshi-dispatch-rfc/',
            },
            {
              label: 'Core Data Adapter Boundary',
              link: '/maintainers/core-data-adapter-boundary/',
            },
            {
              label: 'Formatting Toolchain Policy',
              link: '/maintainers/formatting-toolchain-policy/',
            },
            {
              label: 'Maintenance Automation Policy',
              link: '/maintainers/maintenance-automation-policy/',
            },
            {
              label: 'Package Graduation',
              link: '/maintainers/package-graduation/',
            },
            {
              label: 'Package Manifest Policy',
              link: '/maintainers/package-manifest-policy/',
            },
            {
              label: 'TypeScript Strictness Policy',
              link: '/maintainers/typescript-strictness-policy/',
            },
          ],
        },
      ],
    }),
  ],
});
