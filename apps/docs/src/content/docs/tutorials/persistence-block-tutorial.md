---
title: 'Persistence Block Tutorial: Building Data-Backed Blocks with `wp-typia`'
---

This tutorial walks through creating a WordPress block with server-side persistence using the `persistence` template. You'll learn how to build blocks that store and retrieve data via the WordPress REST API with type-safe validation.

## Prerequisites

- Node.js 24+ installed
- WordPress development environment (wp-env or local server)
- Basic knowledge of TypeScript, React, and WordPress REST API
- Familiarity with the [Basic Block Tutorial](./basic-block-tutorial.md)

## What is the Persistence Template?

The `persistence` template extends the basic block pattern with:

- **REST API Integration**: Typed client-side helpers via `@wp-typia/rest`
- **Server-Side Storage**: Choose between `post-meta` or `custom-table` storage
- **Access Policies**: `authenticated` (logged-in users) or `public` (anonymous with tokens)
- **Schema Generation**: Automatic OpenAPI and JSON Schema for your REST contracts

## Step 1: Create Your Block

```bash
npx wp-typia my-counter --template persistence --package-manager npm --yes --no-install
cd my-counter
npm install
```

### Template Options

The persistence template accepts additional CLI flags:

| Flag                   | Values                                | Description                                                       |
| ---------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| `--data-storage`       | `post-meta`, `custom-table` (default) | Where to persist data                                             |
| `--persistence-policy` | `authenticated` (default), `public`   | Who can write data                                                |
| `--with-wp-env`        | flag                                  | Add local `wp-env` scripts and `.wp-env.json`                     |
| `--with-test-preset`   | flag                                  | Add a test-only `wp-env` config and minimal Playwright smoke test |

Example with custom options:

```bash
npx wp-typia my-counter \
  --template persistence \
  --data-storage custom-table \
  --persistence-policy public \
  --package-manager npm \
  --yes \
  --no-install
```

## Step 2: Understand the Generated Structure

The persistence template scaffolds the same editor/runtime foundation as the other built-ins, plus persistence-specific source files:

```text
my-counter/
├── src/
│   ├── api-client.ts
│   ├── api-types.ts
│   ├── api-validators.ts
│   ├── api.ts
│   ├── block.json
│   ├── data.ts
│   ├── edit.tsx
│   ├── hooks.ts
│   ├── index.tsx
│   ├── interactivity.ts
│   ├── render.php
│   ├── save.tsx
│   ├── style.scss
│   ├── transport.ts
│   ├── types.ts
│   └── validators.ts
├── scripts/
│   ├── sync-project.ts
│   ├── sync-rest-contracts.ts
│   └── sync-types-to-block-json.ts
├── my-counter.php
├── package.json
├── tsconfig.json
└── webpack.config.js
```

Fresh scaffolds already include a starter `src/typia.manifest.json` so editor/runtime imports resolve before the first sync. After you run `npm run sync`, `npm run dev`, or `npm run start`, the scaffold also generates:

- `src/typia.manifest.json`
- `src/typia.schema.json`
- `src/typia.openapi.json`
- `src/typia-validator.php`

The same `npm run sync` flow also refreshes the REST-derived artifacts:

- `src/api.openapi.json`
- `src/api-schemas/*.schema.json`
- `src/api-schemas/*.openapi.json`

## Step 3: Define Your Block Types

Open `src/types.ts` to see the generated types:

```typescript
import type { TextAlignment } from '@wp-typia/block-types/block-editor/alignment';
import { tags } from 'typia';

export interface MyCounterAttributes {
  content: string &
    tags.MinLength<1> &
    tags.MaxLength<250> &
    tags.Default<'My Counter persistence block'>;
  alignment?: TextAlignment & tags.Default<'left'>;
  isVisible?: boolean & tags.Default<true>;
  showCount?: boolean & tags.Default<true>;
  buttonLabel?: string &
    tags.MinLength<1> &
    tags.MaxLength<40> &
    tags.Default<'Persist Count'>;
  resourceKey?: string & tags.MinLength<1> & tags.MaxLength<100>;
}

// Context passed from server to client
export interface MyCounterContext {
  buttonLabel: string;
  persistencePolicy: 'authenticated' | 'public';
  postId: number;
  resourceKey: string;
  storage: 'post-meta' | 'custom-table';
  isVisible: boolean;
}

// Client-side state
export interface MyCounterState {
  bootstrapReady: boolean;
  canWrite: boolean;
  count: number;
  error?: string;
  isBootstrapping: boolean;
  isHydrated: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isVisible: boolean;
  publicWriteExpiresAt?: number;
  publicWriteToken?: string;
  restNonce?: string;
}
```

## Step 4: Define REST API Types

Open `src/api-types.ts` to define your REST contracts:

```typescript
import { tags } from 'typia';

export interface MyCounterStateQuery {
  postId: number & tags.Type<'uint32'>;
  resourceKey: string & tags.MinLength<1> & tags.MaxLength<100>;
}

export interface MyCounterBootstrapQuery {
  postId: number & tags.Type<'uint32'>;
  resourceKey: string & tags.MinLength<1> & tags.MaxLength<100>;
}

export interface MyCounterWriteStateRequest {
  postId: number & tags.Type<'uint32'>;
  publicWriteRequestId: string & tags.MinLength<1> & tags.MaxLength<128>;
  publicWriteToken?: string & tags.MinLength<1> & tags.MaxLength<512>;
  resourceKey: string & tags.MinLength<1> & tags.MaxLength<100>;
  delta?: number & tags.Minimum<1> & tags.Type<'uint32'> & tags.Default<1>;
}

export interface MyCounterBootstrapResponse {
  canWrite: boolean;
  publicWriteExpiresAt?: number & tags.Type<'uint32'>;
  publicWriteToken?: string & tags.MinLength<1> & tags.MaxLength<512>;
  restNonce?: string & tags.MinLength<1> & tags.MaxLength<128>;
}

export interface MyCounterStateResponse {
  postId: number & tags.Type<'uint32'>;
  resourceKey: string & tags.MinLength<1> & tags.MaxLength<100>;
  count: number & tags.Minimum<0> & tags.Type<'uint32'>;
  storage: 'post-meta' | 'custom-table';
}
```

## Step 5: Use the generated transport seam

Persistence scaffolds now split the runtime client layer into three files:

- `src/api-client.ts`: portable contract client generated from `src/api-types.ts`
- `src/transport.ts`: editor/frontend transport wiring
- `src/api.ts`: typed helpers that compose the portable endpoints with the selected transport target

The generated `src/transport.ts` is the first place to customize runtime routing:

```typescript
import { type EndpointCallOptions, resolveRestRouteUrl } from '@wp-typia/rest';

const FRONTEND_READ_BASE_URL = '';
const FRONTEND_WRITE_BASE_URL = '';

function buildCallOptions(
  endpointPath: string,
  baseUrl?: string,
): EndpointCallOptions {
  return {
    requestOptions: {
      url:
        typeof baseUrl === 'string' && baseUrl.length > 0
          ? new URL(endpointPath, baseUrl).toString()
          : resolveRestRouteUrl(endpointPath),
    },
  };
}

// Default: direct WordPress REST
export const persistenceTransportTargets = {
  frontend: {
    read: (endpoint: { path: string }) =>
      buildCallOptions(endpoint.path, FRONTEND_READ_BASE_URL),
    write: (endpoint: { path: string }) =>
      buildCallOptions(endpoint.path, FRONTEND_WRITE_BASE_URL),
  },
};
```

To route the hydrated frontend through a contract-compatible proxy or adapter, edit only the base URL constants in `src/transport.ts`. You do not need to rewrite `src/api.ts`, `src/data.ts`, `src/interactivity.ts`, or `src/api-client.ts`.

For hybrid setups, the scaffold exposes separate `editor` and `frontend` targets so the editor can keep direct WordPress REST while the frontend points somewhere else.

The generated REST surface is now intentionally split:

- `GET /<namespace>/v1/<slug>/state` returns durable persisted state
- `POST /<namespace>/v1/<slug>/state` writes durable persisted state
- `GET /<namespace>/v1/<slug>/bootstrap` returns fresh session-only write data such as `restNonce`, `publicWriteToken`, and `publicWriteExpiresAt`

## Step 6: Implement Frontend Interactivity

The `src/interactivity.ts` file uses the WordPress Interactivity API:

```typescript
import { getContext, store } from '@wordpress/interactivity';
import { generatePublicWriteRequestId } from '@wp-typia/block-runtime/identifiers';
import { fetchBootstrap, fetchState, writeState } from './api';
import type { MyCounterContext, MyCounterState } from './types';

function hasExpiredPublicWriteToken(expiresAt?: number): boolean {
  return (
    typeof expiresAt === 'number' &&
    expiresAt > 0 &&
    Date.now() >= expiresAt * 1000
  );
}

const { actions, state } = store('my-counter', {
  state: {
    bootstrapReady: false,
    canWrite: false,
    count: 0,
    error: undefined,
    isBootstrapping: false,
    isHydrated: false,
    isLoading: false,
    isSaving: false,
    isVisible: true,
    publicWriteExpiresAt: undefined,
    publicWriteToken: undefined,
    restNonce: undefined,
  } as MyCounterState,

  actions: {
    async loadState() {
      const context = getContext<MyCounterContext>();
      const result = await fetchState(
        { postId: context.postId, resourceKey: context.resourceKey },
        { transportTarget: 'frontend' },
      );
      if (result.isValid && result.data) {
        state.count = result.data.count;
      }
    },

    async loadBootstrap() {
      const context = getContext<MyCounterContext>();
      const result = await fetchBootstrap(
        { postId: context.postId, resourceKey: context.resourceKey },
        { transportTarget: 'frontend' },
      );

      state.bootstrapReady = true;
      if (!result.isValid || !result.data) {
        state.canWrite = false;
        return;
      }

      state.publicWriteExpiresAt = result.data.publicWriteExpiresAt;
      state.publicWriteToken = result.data.publicWriteToken;
      state.restNonce = result.data.restNonce;
      state.canWrite =
        result.data.canWrite === true &&
        !hasExpiredPublicWriteToken(result.data.publicWriteExpiresAt);
    },

    async increment() {
      const context = getContext<MyCounterContext>();

      if (!state.bootstrapReady) {
        state.error = 'Write access is still initializing.';
        return;
      }

      if (hasExpiredPublicWriteToken(state.publicWriteExpiresAt)) {
        await actions.loadBootstrap();
      }

      if (!state.canWrite) {
        state.error =
          context.persistencePolicy === 'authenticated'
            ? 'Sign in to persist this counter.'
            : 'Public writes are temporarily unavailable.';
        return;
      }

      const result = await writeState(
        {
          delta: 1,
          postId: context.postId,
          publicWriteRequestId:
            context.persistencePolicy === 'public'
              ? generatePublicWriteRequestId()
              : undefined,
          publicWriteToken:
            context.persistencePolicy === 'public'
              ? state.publicWriteToken
              : undefined,
          resourceKey: context.resourceKey,
        },
        {
          restNonce: state.restNonce,
          transportTarget: 'frontend',
        },
      );

      if (result.isValid && result.data) {
        state.count = result.data.count;
      }
    },
  },

  callbacks: {
    init() {
      const context = getContext<MyCounterContext>();
      state.isVisible = context.isVisible;
    },
    mounted() {
      state.isHydrated = true;
      void Promise.allSettled([actions.loadState(), actions.loadBootstrap()]);
    },
  },
});
```

## Step 7: Server-Side Render

The `render.php` file now keeps only durable block identity in the frozen HTML context. Session-only write access data moves to `/bootstrap`:

```php
<?php
$validator = require __DIR__ . '/typia-validator.php';
$normalized = $validator->apply_defaults($attributes);
$validation = $validator->validate($normalized);

if (empty($validation['valid'])) {
    return '';
}

$resourceKey = (string) $normalized['resourceKey'];
$post_id = $block->context['postId'] ?? get_queried_object_id();
$persistence_policy = 'authenticated'; // scaffold replaces this with the selected policy
$storage_mode = 'custom-table'; // scaffold replaces this with the selected storage mode
$context = [
    'buttonLabel' => (string) $normalized['buttonLabel'],
    'isVisible' => ! empty($normalized['isVisible']),
    'persistencePolicy' => $persistence_policy,
    'postId' => (int) $post_id,
    'resourceKey' => $resourceKey,
    'storage' => $storage_mode,
];

$wrapper_attributes = get_block_wrapper_attributes([
    'data-wp-context' => wp_json_encode($context),
    'data-wp-interactive' => 'my-counter',
    'data-wp-init' => 'callbacks.init',
    'data-wp-run--mounted' => 'callbacks.mounted',
]);
?>

<div <?php echo $wrapper_attributes; ?>>
    <span data-wp-text="state.count">0</span>
    <button
        type="button"
        disabled
        data-wp-bind--disabled="!state.canWrite"
        data-wp-on--click="actions.increment"
    >
        <?php echo esc_html($normalized['buttonLabel']); ?>
    </button>
</div>
```

## Step 8: Generate REST Schemas

Run the REST sync directly when you only want to refresh the endpoint-derived artifacts:

```bash
npm run sync-rest
```

This creates:

- `src/api.openapi.json` - endpoint-aware REST documentation for the scaffolded routes
- `src/api-schemas/*.schema.json` - JSON Schema files
- `src/api-schemas/*.openapi.json` - per-contract OpenAPI compatibility fragments

Use `npm run sync` for the common-case metadata + REST refresh before `npm run build`, `npm run check:code`, or commit. The generated `dev` workflow watches both sync commands for persistence scaffolds, `npm run start` still runs the same one-shot ordering, and both `npm run build` and `npm run check:code` verify that the checked-in artifacts are already current. `npm run sync-types` and `npm run sync-rest` remain available for advanced/manual runs. `npm run sync-types` stays warn-only by default, `npm run sync-types -- --fail-on-lossy` fails only on lossy WordPress projection warnings, and `npm run sync-types -- --strict --report json` emits a CI-friendly JSON report while failing on every warning. `npm run sync-rest` now fails fast when type-derived artifacts are stale or missing, so run `npm run sync` or `npm run sync-types` first when it tells you the metadata layer is out of date. These commands do not create migration history.

For persistence scaffolds, `src/api.openapi.json` is the canonical REST document because it includes the actual route paths, methods, and auth policy metadata. The files in `src/api-schemas/` remain useful per-contract artifacts for validation and compatibility.

For actual customization work:

- edit `my-counter.php` when you need to change storage helpers, route handlers, response shaping, or route registration
- edit `inc/rest-auth.php` or `inc/rest-public.php` when you need to change the write permission policy
- keep `src/api-types.ts` as the source of truth for contracts and regenerate `src/api-schemas/*` plus `src/api.openapi.json` instead of hand-maintaining those generated artifacts

These schemas can be used for:

- API documentation
- Client SDK generation
- Contract testing

## Step 9: Test Your Block

### Local Development

```bash
npm run dev
```

### Mount the Plugin Into WordPress

By default, load the generated plugin into your existing WordPress development environment and activate it there. If you scaffold with `--with-wp-env`, the generated project also includes local `wp-env:start`, `wp-env:stop`, and `wp-env:reset` scripts. If you scaffold with `--with-test-preset`, it additionally includes `.wp-env.test.json`, a minimal Playwright smoke test, and `wp-env:start:test` / `test:e2e` scripts.

Typical flow:

1. Keep the scaffold running with `npm run dev`
2. Mount or symlink the generated plugin into a WordPress install
3. Activate the plugin in `wp-admin`
4. Insert the block into a post or page

### Test the REST API

Copy the unique **Resource Key** shown in the block inspector after inserting
and saving the block, then substitute it below.

```bash
# Get counter value
curl "http://localhost:8888/wp-json/my-counter/v1/my-counter/state?postId=1&resourceKey=<resource-key>"

# Increment counter (default authenticated policy)
curl -X POST \
  -H "X-WP-Nonce: <wp-rest-nonce>" \
  -H "Content-Type: application/json" \
  -d '{"postId":1,"resourceKey":"<resource-key>","delta":1}' \
  "http://localhost:8888/wp-json/my-counter/v1/my-counter/state"
```

If you scaffold with `--persistence-policy public`, call the dedicated `/bootstrap` endpoint first to fetch a fresh `publicWriteToken`, then send that token plus a fresh `publicWriteRequestId` for each write attempt instead of a REST nonce.

Scaffolded editor identity hooks, validators, and interactivity modules use
`@wp-typia/block-runtime/identifiers` as the shared source of truth for
unique, duplicate-safe `resourceKey` values and per-write
`publicWriteRequestId` values instead of carrying local inline generator
helpers.

## Understanding Storage Modes

### Post Meta (`post-meta`)

Data stored in WordPress post meta:

- Simple setup, no additional tables
- Good for per-post counters
- Limited scalability for high-volume writes

### Custom Table (`custom-table`)

Data stored in a dedicated table:

- Better performance at scale
- Requires migration on plugin activation
- Supports aggregated counters across posts

## Understanding Access Policies

### Authenticated

- Requires logged-in user
- Uses WordPress REST nonce for CSRF protection
- User context available in handlers

### Public

- Anonymous writes allowed
- Uses signed short-lived tokens
- Refreshes write access through the dedicated `/bootstrap` endpoint instead of freezing tokens into cached HTML
- Requires a fresh request id per write attempt
- Applies coarse rate limiting before the write handler runs
- Token validated on write

For experiments, impressions, or other high-value metrics, treat those defaults as a starting point and add application-specific abuse controls.

## Generated Plugin Bootstrap

The main PHP file (`my-counter.php`) includes:

- REST route registration
- Storage backend initialization
- Public token signing (for `public` policy)
- Custom table migrations (for `custom-table` storage)

## What's Next?

1. **Add Custom Endpoints**: Extend the REST API with additional routes
2. **Tune Rate Limiting**: Adjust the default public write guardrails for your traffic profile
3. **Add Caching**: Cache counter values for better performance
4. **Extend Validation**: Add custom validation rules in `api-validators.ts`
5. **Move to Compound Parent/Child Blocks**: Start from the [Compound Block Tutorial](./compound-block-tutorial.md) when the persisted behavior belongs on a top-level container block with internal children

## Additional Resources

- [Basic Block Tutorial](./basic-block-tutorial.md)
- [Compound Block Tutorial](./compound-block-tutorial.md)
- [API Reference](../reference/api.md)
- [@wp-typia/rest Documentation](https://github.com/imjlk/wp-typia/blob/main/packages/wp-typia-rest/README.md)
- [WordPress Interactivity API](https://developer.wordpress.org/block-editor/reference-guides/interactivity-api/)
- [WordPress REST API Handbook](https://developer.wordpress.org/rest-api/)

---

Happy coding! 🚀
