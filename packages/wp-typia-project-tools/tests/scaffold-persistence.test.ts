import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { apiClientPackageVersion, cleanupScaffoldTempRoot, createScaffoldTempRoot, getCommandErrorMessage, replaceGeneratedTransportBaseUrls, restPackageVersion, runGeneratedJsonScript, runGeneratedJsonScriptAsync, runGeneratedScript, startLocalCounterStubServer, typecheckGeneratedProject, wpTypiaPackageManifest } from "./helpers/scaffold-test-harness.js";
import { scaffoldProject } from "../src/runtime/index.js";

describe("@wp-typia/project-tools scaffold persistence", () => {
  const tempRoot = createScaffoldTempRoot("wp-typia-scaffold-persistence-");

  afterAll(() => {
    cleanupScaffoldTempRoot(tempRoot);
  });

test(
  "scaffoldProject creates a persistence template with signed public writes and explicit storage mode",
  async () => {
    const targetDir = path.join(tempRoot, "demo-persistence-public");

    await scaffoldProject({
      projectDir: targetDir,
      templateId: "persistence",
      dataStorageMode: "post-meta",
      packageManager: "npm",
      noInstall: true,
      answers: {
        author: "Test Runner",
        dataStorageMode: "post-meta",
        description: "Demo persistence block",
        namespace: "create-block",
        persistencePolicy: "public",
        slug: "demo-persistence-public",
        title: `John's "Counter" Public`,
      },
      persistencePolicy: "public",
    });

    runGeneratedScript(targetDir, "scripts/sync-project.ts", ["--check"]);

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
    );
    const pluginBootstrap = fs.readFileSync(
      path.join(targetDir, "demo-persistence-public.php"),
      "utf8"
    );
    const generatedApi = fs.readFileSync(
      path.join(targetDir, "src", "api.ts"),
      "utf8"
    );
    const seededApiClient = fs.readFileSync(
      path.join(targetDir, "src", "api-client.ts"),
      "utf8"
    );
    const generatedData = fs.readFileSync(
      path.join(targetDir, "src", "data.ts"),
      "utf8"
    );
    const generatedTransport = fs.readFileSync(
      path.join(targetDir, "src", "transport.ts"),
      "utf8"
    );
    const generatedSyncRest = fs.readFileSync(
      path.join(targetDir, "scripts", "sync-rest-contracts.ts"),
      "utf8"
    );
    const generatedRender = fs.readFileSync(
      path.join(targetDir, "src", "render.php"),
      "utf8"
    );
    const generatedApiTypes = fs.readFileSync(
      path.join(targetDir, "src", "api-types.ts"),
      "utf8"
    );
    const generatedValidatorToolkit = fs.readFileSync(
      path.join(targetDir, "src", "validator-toolkit.ts"),
      "utf8"
    );
    const generatedManifest = JSON.parse(
      fs.readFileSync(
        path.join(targetDir, "src", "typia.manifest.json"),
        "utf8"
      )
    );
    const generatedInteractivity = fs.readFileSync(
      path.join(targetDir, "src", "interactivity.ts"),
      "utf8"
    );
    const generatedTypes = fs.readFileSync(
      path.join(targetDir, "src", "types.ts"),
      "utf8"
    );
    const generatedEdit = fs.readFileSync(
      path.join(targetDir, "src", "edit.tsx"),
      "utf8"
    );
    const generatedIndex = fs.readFileSync(
      path.join(targetDir, "src", "index.tsx"),
      "utf8"
    );
    const generatedValidators = fs.readFileSync(
      path.join(targetDir, "src", "validators.ts"),
      "utf8"
    );
    const generatedStyle = fs.readFileSync(
      path.join(targetDir, "src", "style.scss"),
      "utf8"
    );
    const generatedSave = fs.readFileSync(
      path.join(targetDir, "src", "save.tsx"),
      "utf8"
    );
    const readme = fs.readFileSync(path.join(targetDir, "README.md"), "utf8");
    const restPublicHelper = fs.readFileSync(
      path.join(targetDir, "inc", "rest-public.php"),
      "utf8"
    );
    const blockJson = JSON.parse(
      fs.readFileSync(path.join(targetDir, "src", "block.json"), "utf8")
    );

    expect(packageJson.name).toBe("demo-persistence-public");
    expect(packageJson.devDependencies.prettier).toBe("3.8.2");
    expect(packageJson.devDependencies["@wp-typia/api-client"]).toBe(
      apiClientPackageVersion
    );
    expect(packageJson.devDependencies["@wp-typia/rest"]).toBe(
      restPackageVersion
    );
    expect(packageJson.dependencies["@wordpress/data"]).toBe("~10.46.0");
    expect(packageJson.devDependencies["chokidar-cli"]).toBe("^3.0.0");
    expect(packageJson.devDependencies.concurrently).toBe("^9.0.1");
    expect(packageJson.scripts.sync).toBe("tsx scripts/sync-project.ts");
    expect(packageJson.scripts.build).toBe(
      "npm run sync -- --check && wp-scripts build --experimental-modules"
    );
    expect(packageJson.scripts.dev).toBe(
      'npm run sync && concurrently -k -n sync-types,sync-rest,editor -c yellow,magenta,blue "npm run watch:sync-types" "npm run watch:sync-rest" "npm run start:editor"'
    );
    expect(packageJson.scripts["start:editor"]).toBe(
      "wp-scripts start --experimental-modules"
    );
    expect(packageJson.scripts["watch:sync-types"]).toBe(
      'chokidar "src/types.ts" --debounce 200 -c "npm run sync-types"'
    );
    expect(packageJson.scripts["watch:sync-rest"]).toBe(
      'chokidar "src/api-types.ts" --debounce 200 -c "npm run sync-rest"'
    );
    expect(packageJson.scripts.typecheck).toBe(
      "npm run sync -- --check && tsc --noEmit"
    );
    expect(blockJson.textdomain).toBe("demo-persistence-public");
    expect(blockJson.version).toBe("0.1.0");
    expect(blockJson.category).toBe("widgets");
    expect(blockJson.icon).toBe("database");
    expect(blockJson.attributes.resourceKey).not.toHaveProperty("default");
    expect(generatedManifest.manifestVersion).toBe(2);
    expect(generatedManifest.sourceType).toBe(
      "DemoPersistencePublicAttributes"
    );
    expect(generatedManifest.attributes.resourceKey.typia.hasDefault).toBe(false);
    expect(generatedManifest.attributes.resourceKey.typia.defaultValue).toBeNull();
    expect(
      fs.existsSync(path.join(targetDir, "inc", "rest-shared.php"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(targetDir, "inc", "rest-public.php"))
    ).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "languages", ".gitkeep"))).toBe(
      true
    );
    expect(pluginBootstrap).toContain("post-meta");
    expect(pluginBootstrap).toContain(
      "Text Domain:       demo-persistence-public"
    );
    expect(pluginBootstrap).toContain("Tested up to:      7.0");
    expect(pluginBootstrap).toContain("Domain Path:       /languages");
    expect(pluginBootstrap).toContain("load_plugin_textdomain(");
    expect(pluginBootstrap).toContain("Pragma', 'no-cache'");
    expect(pluginBootstrap).toContain(
      "require_once __DIR__ . '/inc/rest-shared.php';"
    );
    expect(pluginBootstrap).toContain(
      "require_once __DIR__ . '/inc/rest-public.php';"
    );
    expect(pluginBootstrap).toContain("return 'wpt_pcl_' . md5(");
    expect(pluginBootstrap).toContain(
      "permission_callback' => 'demo_persistence_public_can_write_publicly'"
    );
    expect(pluginBootstrap).toContain("PUBLIC_WRITE_RATE_LIMIT_WINDOW");
    expect(pluginBootstrap).toContain("PUBLIC_WRITE_RATE_LIMIT_MAX");
    expect(pluginBootstrap).toContain(
      "demo_persistence_public_handle_get_bootstrap"
    );
    expect(pluginBootstrap).toContain(
      "function demo_persistence_public_has_rendered_block_instance"
    );
    expect(pluginBootstrap).toContain("create-block/demo-persistence-public");
    expect(pluginBootstrap).toContain(
      "array_key_exists( 'resourceKey', $attributes )"
    );
    expect(pluginBootstrap).toContain("is_post_publicly_viewable( $post )");
    expect(pluginBootstrap).toContain("! is_post_publicly_viewable( $post ) ||");
    expect(pluginBootstrap).toContain(": 'primary';");
    expect(generatedTypes).not.toContain('tags.Default<"primary">');
    expect(generatedEdit).toContain("store as blockEditorStore");
    expect(generatedEdit).toContain("usePersistentBlockIdentity");
    expect(generatedEdit).toContain("attributeName: 'resourceKey'");
    expect(generatedEdit).toContain(
      "blockName: 'create-block/demo-persistence-public'"
    );
    expect(generatedEdit).toContain("prefix: 'demo-persistence-public'");
    expect(generatedRender).toContain(
      "array_key_exists( 'resourceKey', $normalized ) ? (string) $normalized['resourceKey'] : 'primary'"
    );
    expect(generatedRender).toContain(
      "empty( $validation['valid'] ) || '' === $resource_key"
    );
    expect(restPublicHelper).toContain(
      "function demo_persistence_public_verify_public_write_token"
    );
    expect(restPublicHelper).toContain(
      "function demo_persistence_public_consume_public_write_request_id"
    );
    expect(restPublicHelper).toContain(
      "function demo_persistence_public_enforce_public_write_rate_limit"
    );
    expect(restPublicHelper).toContain("SELECT GET_LOCK(%s, 5)");
    expect(restPublicHelper).toContain("SELECT RELEASE_LOCK(%s)");
    expect(restPublicHelper).toContain("return 'wpt_pwl_' . md5(");
    expect(generatedApi).toContain("@wp-typia/rest");
    expect(generatedApi).toContain("from './api-client'");
    expect(generatedApi).toContain("from './transport'");
    expect(generatedApi).toContain(
      "getDemoPersistencePublicBootstrapEndpoint"
    );
    expect(generatedApi).toContain("getDemoPersistencePublicStateEndpoint");
    expect(generatedApi).toContain("writeDemoPersistencePublicStateEndpoint");
    expect(generatedApi).not.toContain("createEndpoint(");
    expect(generatedData).toContain("from '@wp-typia/rest/react'");
    expect(generatedData).toContain("transportTarget = 'editor'");
    expect(generatedData).toContain("useDemoPersistencePublicBootstrapQuery");
    expect(generatedTransport).toContain(
      "const EDITOR_READ_BASE_URL: string | undefined = undefined;"
    );
    expect(generatedTransport).toContain(
      "const FRONTEND_WRITE_BASE_URL: string | undefined = undefined;"
    );
    expect(generatedTransport).toContain("resolveTransportCallOptions");
    expect(generatedTransport).not.toContain("includeRestNonce: true");
    expect(generatedTransport).toContain("includeRestNonce: false");
    expect(generatedInteractivity).toContain(
      "@wp-typia/block-runtime/identifiers"
    );
    expect(generatedInteractivity).toContain("generatePublicWriteRequestId");
    expect(generatedInteractivity).not.toContain(
      "function createPublicWriteRequestId"
    );
    expect(generatedInteractivity).toContain("await actions.loadBootstrap();");
    expect(generatedInteractivity).toContain("transportTarget: 'frontend'");
    expect(generatedValidatorToolkit).toContain(
      "createScaffoldValidatorToolkit"
    );
    expect(generatedValidatorToolkit).not.toContain("typia.createValidate");
    expect(generatedValidators).toContain(
      "@wp-typia/block-runtime/identifiers"
    );
    expect(generatedValidators).toContain("generateResourceKey");
    expect(generatedValidators).toMatch(
      /typia\.createValidate<\s*DemoPersistencePublicAttributes\s*>\(\)/
    );
    expect(generatedValidators).not.toContain("const generateResourceKey");
    expect(generatedEdit).toContain(
      "const alignmentValue = editorFields.getStringValue("
    );
    expect(generatedEdit).toMatch(
      /editorFields\.getStringValue\(\s*attributes,\s*['"]alignment['"]/u
    );
    expect(generatedEdit).toContain("attributes={ attributes }");
    expect(generatedEdit).toContain(
      "import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';"
    );
    expect(generatedEdit).toContain(
      "type EditProps = BlockEditProps< DemoPersistencePublicAttributes >;"
    );
    expect(generatedIndex).toContain('buildScaffoldBlockRegistration');
    expect(generatedIndex).toContain(
      'registerScaffoldBlockType(registration.name, registration.settings);'
    );
    expect(generatedIndex).not.toContain('registerBlockType<');
    expect(generatedIndex).toContain('registerScaffoldBlockType');
    expect(generatedEdit).toContain("}: EditProps )");
    expect(generatedEdit).not.toContain(
      "attributes as unknown as Record< string, unknown >"
    );
    expect(generatedEdit).toContain(
      "{ __( 'Storage mode: post-meta', 'demo-persistence-public' ) }"
    );
    expect(generatedEdit).toContain(
      "{ __( 'Storage mode:', 'demo-persistence-public' ) } post-meta"
    );
    expect(generatedEdit).toContain(
      `placeholder={ __( ${JSON.stringify(`John's "Counter" Public`)} + ' persistence block', 'demo-persistence-public' ) }`
    );
    expect(generatedData).toContain("useDemoPersistencePublicStateQuery");
    expect(generatedData).toContain(
      "useWriteDemoPersistencePublicStateMutation"
    );
    expect(generatedSyncRest).toContain("syncTypeSchemas");
    expect(generatedSyncRest).toContain("defineEndpointManifest");
    expect(generatedSyncRest).toContain("syncEndpointClient");
    expect(generatedSyncRest).toContain("syncRestOpenApi");
    expect(generatedSyncRest).toContain("--check");
    expect(generatedSyncRest).toContain(
      "@wp-typia/block-runtime/metadata-core"
    );
    expect(generatedSyncRest).toContain(
      "const REST_ENDPOINT_MANIFEST = defineEndpointManifest"
    );
    expect(generatedSyncRest).toContain("manifest: REST_ENDPOINT_MANIFEST");
    expect(generatedSyncRest).not.toContain("const CONTRACTS =");
    expect(generatedSyncRest).not.toContain("const ENDPOINTS =");
    expect(generatedSyncRest).not.toContain(
      "@wp-typia/project-tools/schema-core"
    );
    expect(generatedSyncRest).toContain("src/api.openapi.json");
    expect(generatedSyncRest).not.toContain(
      "openApiInfo: REST_ENDPOINT_MANIFEST.info"
    );
    expect(generatedSyncRest).toContain(
      `tags: [ ${JSON.stringify(`John's "Counter" Public`)} ]`
    );
    expect(generatedSyncRest).toContain(
      `title: ${JSON.stringify(`John's "Counter" Public`)} + ' REST API'`
    );
    expect(generatedSyncRest).toMatch(
      /auth:\s*'public'[\s\S]*?operationId:\s*'getDemoPersistencePublicBootstrap'/
    );
    expect(generatedStyle).toContain(
      ".wp-block-create-block-demo-persistence-public"
    );
    expect(generatedStyle).toContain(
      ".wp-block-create-block-demo-persistence-public-frontend"
    );
    expect(seededApiClient).toContain("from '@wp-typia/api-client'");
    expect(seededApiClient).toContain(
      "export const getDemoPersistencePublicBootstrapEndpoint"
    );
    expect(
      fs.existsSync(
        path.join(targetDir, "src", "api-schemas", "bootstrap-query.schema.json")
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          targetDir,
          "src",
          "api-schemas",
          "bootstrap-response.schema.json"
        )
      )
    ).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "src", "api.openapi.json"))).toBe(
      true
    );
    expect(
      fs.existsSync(path.join(targetDir, "scripts", "sync-project.ts"))
    ).toBe(true);
    const generatedSyncProject = fs.readFileSync(
      path.join(targetDir, "scripts", "sync-project.ts"),
      "utf8"
    );
    expect(generatedSyncProject).toContain("spawnSync");
    expect(generatedSyncProject).toContain(
      "shell: process.platform === 'win32'"
    );
    expect(generatedSyncProject).toContain("spawnSync( 'tsx', args");
    expect(generatedSyncProject).not.toContain("getLocalTsxBinary");
    expect(generatedRender).not.toContain("publicWriteToken");
    expect(generatedRender).toContain(
      "demo_persistence_public_record_rendered_block_instance"
    );
    expect(generatedRender).toContain(
      "context.bootstrapReady || context.canWrite"
    );
    expect(generatedRender).toContain(
      'class="wp-block-create-block-demo-persistence-public-frontend"'
    );
    expect(generatedRender).toContain(
      "wp-block-create-block-demo-persistence-public-frontend__content"
    );
    expect(generatedRender).toContain('role="status"');
    expect(generatedRender).toContain('aria-live="polite"');
    expect(generatedApiTypes).toContain("publicWriteRequestId: string");
    expect(generatedTypes).toContain(
      'persistencePolicy: "authenticated" | "public";'
    );
    expect(generatedSave).toContain("intentionally server-rendered");
    expect(generatedSave).toContain("return null;");
    expect(readme).toContain("npm run dev");
    expect(readme).toContain("npm run sync");
    expect(readme).toContain("npm run sync-types");
    expect(readme).toContain("npm run sync-rest");
    expect(readme).toContain("## Quick Start");
    expect(readme).toContain("## Advanced Sync");
    expect(readme).toContain("## Before First Commit");
    expect(readme).toContain("src/api-types.ts");
    expect(readme).toContain(
      "`src/render.php` is the canonical frontend entry"
    );
    expect(readme).toContain("`src/save.tsx` returns `null`");
    expect(readme).toContain(
      "`src/transport.ts` is the first-class transport seam"
    );
    expect(readme).toContain(
      "per-request ids, and coarse rate limiting by default"
    );
    expect(readme).toContain("## PHP REST Extension Points");
    expect(readme).toContain('git commit -m "Initial scaffold"');
    expect(readme).toContain("Edit `demo-persistence-public.php`");
    expect(readme).toContain(
      "Edit `src/transport.ts` when you need to switch between direct WordPress REST and a contract-compatible proxy or BFF"
    );
    expect(readme).toContain(
      "Edit `inc/rest-auth.php` or `inc/rest-public.php` when you need to customize write permissions or token/request-id/nonce checks"
    );
    expect(pluginBootstrap).toContain("Customize storage helpers");
    expect(pluginBootstrap).toContain(
      "Route handlers are the main product-level extension point"
    );
    expect(pluginBootstrap).toContain(
      "Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0'"
    );
    expect(pluginBootstrap).toContain("Pragma', 'no-cache'");
    expect(pluginBootstrap).toContain(
      "if ( '' !== $token && $expires_at > 0 && ! $is_expired ) {"
    );
    expect(restPublicHelper).toContain(
      "Customize the public write gate here"
    );

    typecheckGeneratedProject(targetDir);

    expect(seededApiClient).toContain(
      "export const getDemoPersistencePublicBootstrapEndpoint"
    );
    expect(seededApiClient).toContain(
      "export const getDemoPersistencePublicStateEndpoint"
    );
    expect(seededApiClient).toContain(
      "export function writeDemoPersistencePublicState("
    );
  },
  { timeout: 30_000 }
);

test(
  "persistence sync-rest fails fast when type-derived artifacts are stale",
  async () => {
    const targetDir = path.join(tempRoot, "demo-persistence-stale-guard");

    await scaffoldProject({
      projectDir: targetDir,
      templateId: "persistence",
      dataStorageMode: "custom-table",
      packageManager: "npm",
      noInstall: true,
      answers: {
        author: "Test Runner",
        dataStorageMode: "custom-table",
        description: "Demo stale guard block",
        namespace: "create-block",
        persistencePolicy: "authenticated",
        slug: "demo-persistence-stale-guard",
        title: "Demo Persistence Stale Guard",
      },
    });

    const staleBlockJsonPath = path.join(targetDir, "src", "block.json");
    const staleBlockJson = JSON.parse(
      fs.readFileSync(staleBlockJsonPath, "utf8")
    );

    staleBlockJson.attributes.__staleCoverage = {
      type: "string",
    };

    fs.writeFileSync(
      staleBlockJsonPath,
      `${JSON.stringify(staleBlockJson, null, 2)}\n`,
      "utf8"
    );

    const errorMessage = getCommandErrorMessage(() =>
      runGeneratedScript(targetDir, "scripts/sync-rest-contracts.ts")
    );

    expect(errorMessage).toContain("Run `sync` or `sync-types` first");

    runGeneratedScript(targetDir, "scripts/sync-project.ts");
    runGeneratedScript(targetDir, "scripts/sync-rest-contracts.ts");
  },
  60_000
);

test(
  "scaffoldProject creates a persistence template with authenticated writes by default",
  async () => {
  const targetDir = path.join(tempRoot, "demo-persistence-authenticated");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: "persistence",
    dataStorageMode: "custom-table",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      dataStorageMode: "custom-table",
      description: "Demo authenticated persistence block",
      namespace: "create-block",
      persistencePolicy: "authenticated",
      slug: "demo-persistence-authenticated",
      title: `John's "Counter" Authenticated`,
    },
  });

  const pluginBootstrap = fs.readFileSync(
    path.join(targetDir, "demo-persistence-authenticated.php"),
    "utf8"
  );
  const restAuthHelper = fs.readFileSync(
    path.join(targetDir, "inc", "rest-auth.php"),
    "utf8"
  );
  const generatedRender = fs.readFileSync(
    path.join(targetDir, "src", "render.php"),
    "utf8"
  );
  const generatedApiTypes = fs.readFileSync(
    path.join(targetDir, "src", "api-types.ts"),
    "utf8"
  );
  const generatedTransport = fs.readFileSync(
    path.join(targetDir, "src", "transport.ts"),
    "utf8"
  );
  const generatedInteractivity = fs.readFileSync(
    path.join(targetDir, "src", "interactivity.ts"),
    "utf8"
  );
  const generatedSyncRest = fs.readFileSync(
    path.join(targetDir, "scripts", "sync-rest-contracts.ts"),
    "utf8"
  );
  const generatedManifest = JSON.parse(
    fs.readFileSync(
      path.join(targetDir, "src", "typia.manifest.json"),
      "utf8"
    )
  );
  const generatedTypes = fs.readFileSync(
    path.join(targetDir, "src", "types.ts"),
    "utf8"
  );
  const generatedEdit = fs.readFileSync(
    path.join(targetDir, "src", "edit.tsx"),
    "utf8"
  );
  const generatedStyle = fs.readFileSync(
    path.join(targetDir, "src", "style.scss"),
    "utf8"
  );
  const generatedSave = fs.readFileSync(
    path.join(targetDir, "src", "save.tsx"),
    "utf8"
  );
  const readme = fs.readFileSync(path.join(targetDir, "README.md"), "utf8");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "package.json"), "utf8")
  );
  const blockJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "src", "block.json"), "utf8")
  );

  expect(packageJson.name).toBe("demo-persistence-authenticated");
  expect(packageJson.devDependencies.prettier).toBe("3.8.2");
  expect(packageJson.scripts.dev).toBe(
    'npm run sync && concurrently -k -n sync-types,sync-rest,editor -c yellow,magenta,blue "npm run watch:sync-types" "npm run watch:sync-rest" "npm run start:editor"'
  );
  expect(blockJson.textdomain).toBe("demo-persistence-authenticated");
  expect(generatedManifest.manifestVersion).toBe(2);
  expect(generatedManifest.sourceType).toBe(
    "DemoPersistenceAuthenticatedAttributes"
  );
  expect(fs.existsSync(path.join(targetDir, "inc", "rest-shared.php"))).toBe(
    true
  );
  expect(fs.existsSync(path.join(targetDir, "inc", "rest-auth.php"))).toBe(
    true
  );
  expect(fs.existsSync(path.join(targetDir, "languages", ".gitkeep"))).toBe(
    true
  );
  expect(pluginBootstrap).toContain(
    "Text Domain:       demo-persistence-authenticated"
  );
  expect(pluginBootstrap).toContain("Tested up to:      7.0");
  expect(pluginBootstrap).toContain("Domain Path:       /languages");
  expect(pluginBootstrap).toContain("load_plugin_textdomain(");
  expect(pluginBootstrap).toContain(
    "require_once __DIR__ . '/inc/rest-shared.php';"
  );
  expect(pluginBootstrap).toContain(
    "require_once __DIR__ . '/inc/rest-auth.php';"
  );
  expect(pluginBootstrap).toContain("return 'wpt_pcl_' . md5(");
  expect(pluginBootstrap).toContain(
    "permission_callback' => 'demo_persistence_authenticated_can_write_authenticated'"
  );
  expect(pluginBootstrap).toContain(
    "demo_persistence_authenticated_handle_get_bootstrap"
  );
  expect(pluginBootstrap).toContain(
    "function demo_persistence_authenticated_has_rendered_block_instance"
  );
  expect(pluginBootstrap).toContain("is_post_publicly_viewable( $post )");
  expect(pluginBootstrap).toContain("current_user_can( 'read_post', $post->ID )");
  expect(pluginBootstrap).toContain(
    "create-block/demo-persistence-authenticated"
  );
  expect(pluginBootstrap).toContain(
    "Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0'"
  );
  expect(pluginBootstrap).toContain("Pragma', 'no-cache'");
  expect(pluginBootstrap).toContain("Vary', 'Cookie'");
  expect(restAuthHelper).toContain(
    "function demo_persistence_authenticated_can_write_authenticated"
  );
  expect(generatedSyncRest).toMatch(
    /auth:\s*'public'[\s\S]*?operationId:\s*'getDemoPersistenceAuthenticatedBootstrap'/
  );
  expect(generatedSyncRest).toContain(
    `tags: [ ${JSON.stringify(`John's "Counter" Authenticated`)} ]`
  );
  expect(generatedSyncRest).toContain(
    `title: ${JSON.stringify(`John's "Counter" Authenticated`)} + ' REST API'`
  );
  expect(fs.existsSync(path.join(targetDir, "src", "api-client.ts"))).toBe(
    true
  );
  expect(
    fs.existsSync(
      path.join(targetDir, "src", "api-schemas", "bootstrap-query.schema.json")
    )
  ).toBe(true);
  expect(generatedStyle).toContain(
    ".wp-block-create-block-demo-persistence-authenticated"
  );
  expect(generatedStyle).toContain(
    ".wp-block-create-block-demo-persistence-authenticated-frontend"
  );
  expect(generatedRender).toContain(
    'class="wp-block-create-block-demo-persistence-authenticated-frontend"'
  );
  expect(generatedRender).toContain(
    "demo_persistence_authenticated_record_rendered_block_instance"
  );
  expect(generatedRender).toContain("Sign in to persist this counter.");
  expect(generatedApiTypes).toContain("publicWriteRequestId?: string");
  expect(generatedApiTypes).toContain("restNonce?: string");
  expect(generatedApiTypes).not.toContain("publicWriteExpiresAt?: number");
  expect(generatedApiTypes).not.toContain("{{#isPublicPersistencePolicy}}");
  expect(generatedInteractivity).toContain("includePublicWriteCredentials = false");
  expect(generatedInteractivity).toContain("'publicWriteExpiresAt' in result.data");
  expect(generatedInteractivity).toContain("'publicWriteToken' in result.data");
  expect(generatedInteractivity).toContain("'restNonce' in result.data");
  expect(generatedTransport).toContain("resolveRestNonce");
  expect(generatedTransport).toContain("includeRestNonce: true");
  expect(generatedTransport).toContain("includeRestNonce: false");
  expect(pluginBootstrap).toContain(
    "define( 'DEMO_PERSISTENCE_AUTHENTICATED_DATA_STORAGE_MODE', 'custom-table' );"
  );
  expect(pluginBootstrap).toContain(
    "if ( 'custom-table' === DEMO_PERSISTENCE_AUTHENTICATED_DATA_STORAGE_MODE"
  );
  expect(pluginBootstrap).toContain(
    "'storage'     => DEMO_PERSISTENCE_AUTHENTICATED_DATA_STORAGE_MODE,"
  );
  expect(generatedTypes).toContain(
    'persistencePolicy: "authenticated" | "public";'
  );
  expect(generatedEdit).toContain(
    "const alignmentValue = editorFields.getStringValue("
  );
  expect(generatedEdit).toMatch(
    /editorFields\.getStringValue\(\s*attributes,\s*['"]alignment['"]/u
  );
  expect(generatedEdit).toContain("attributes={ attributes }");
  expect(generatedEdit).toContain(
    "import type { BlockEditProps } from '@wp-typia/block-types/blocks/registration';"
  );
  expect(generatedEdit).toContain(
    "type EditProps = BlockEditProps< DemoPersistenceAuthenticatedAttributes >;"
  );
  expect(generatedEdit).toContain("}: EditProps )");
  expect(generatedEdit).not.toContain(
    "attributes as unknown as Record< string, unknown >"
  );
  expect(generatedEdit).toContain(
    "{ __( 'Storage mode: custom-table', 'demo-persistence-authenticated' ) }"
  );
  expect(generatedEdit).toContain(
    "{ __( 'Storage mode:', 'demo-persistence-authenticated' ) } custom-table"
  );
  expect(generatedEdit).toContain(
    `placeholder={ __( ${JSON.stringify(`John's "Counter" Authenticated`)} + ' persistence block', 'demo-persistence-authenticated' ) }`
  );
  expect(generatedEdit).toContain(
    "Stable persisted identifier used by the storage-backed counter endpoint."
  );
  expect(generatedEdit).toContain(
    "Render mode: dynamic. `render.php` bootstraps durable post context, while fresh session-only write data is loaded from the dedicated `/bootstrap` endpoint after hydration."
  );
  expect(generatedSave).toContain("intentionally server-rendered");
  expect(generatedSave).toContain("return null;");
  expect(readme).toContain("npm run dev");
  expect(readme).toContain("## Quick Start");
  expect(readme).toContain("## Advanced Sync");
  expect(readme).toContain("## Before First Commit");
  expect(readme).toContain(
    `npx --yes wp-typia@${wpTypiaPackageManifest.version} doctor`
  );
  expect(readme).toContain("## PHP REST Extension Points");
  expect(readme).toContain("Edit `demo-persistence-authenticated.php`");
  expect(readme).toContain(
    "Edit `src/transport.ts` when you need to switch between direct WordPress REST and a contract-compatible proxy or BFF"
  );
  expect(readme).toContain(
    "`src/render.php` is the canonical frontend entry"
  );
  expect(readme).toContain("`src/save.tsx` returns `null`");
  expect(readme).toContain(
    "`src/transport.ts` is the first-class transport seam"
  );
  expect(restAuthHelper).toContain(
    "Customize authenticated write policy here"
  );
  typecheckGeneratedProject(targetDir);
},
{ timeout: 20_000 }
);

test("scaffoldProject emits alternate render target entries for persistence scaffolds", async () => {
  const targetDir = path.join(tempRoot, "demo-persistence-alternate-render-targets");

  await scaffoldProject({
    alternateRenderTargets: "email,plain-text",
    projectDir: targetDir,
    templateId: "persistence",
    dataStorageMode: "custom-table",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      dataStorageMode: "custom-table",
      description: "Demo persistence alternate render targets",
      namespace: "create-block",
      persistencePolicy: "authenticated",
      slug: "demo-persistence-alternate-render-targets",
      title: "Demo Persistence Alternate Render Targets",
    },
    persistencePolicy: "authenticated",
  });

  const readme = fs.readFileSync(path.join(targetDir, "README.md"), "utf8");
  const renderTargetsSource = fs.readFileSync(
    path.join(targetDir, "src", "render-targets.php"),
    "utf8"
  );
  const webRenderSource = fs.readFileSync(
    path.join(targetDir, "src", "render.php"),
    "utf8"
  );
  const emailRenderSource = fs.readFileSync(
    path.join(targetDir, "src", "render-email.php"),
    "utf8"
  );
  const textRenderSource = fs.readFileSync(
    path.join(targetDir, "src", "render-text.php"),
    "utf8"
  );

  expect(readme).toContain("## Alternate Render Targets");
  expect(readme).toContain("src/render-email.php");
  expect(readme).toContain("src/render-text.php");
  expect(readme).toContain("src/render-targets.php");
  expect(renderTargetsSource).toMatch(/function\s+.+_render_target\(/);
  expect(renderTargetsSource).toContain(
    "array_key_exists( 'resourceKey', $normalized ) ? (string) $normalized['resourceKey'] : 'primary'"
  );
  expect(renderTargetsSource).toContain(
    "empty( $validation['valid'] ) || '' === $resource_key"
  );
  expect(webRenderSource).toContain("render_target( 'web'");
  expect(emailRenderSource).toContain("render_target( 'email'");
  expect(textRenderSource).toContain("render_target( 'plain-text'");
  expect(fs.existsSync(path.join(targetDir, "src", "render-mjml.php"))).toBe(
    false
  );
});

test("generated public persistence transport skips nonce injection even when wpApiSettings is present", async () => {
  const targetDir = path.join(tempRoot, "demo-persistence-public-transport");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: "persistence",
    dataStorageMode: "custom-table",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      dataStorageMode: "custom-table",
      description: "Demo public persistence transport behavior",
      namespace: "create-block",
      persistencePolicy: "public",
      slug: "demo-persistence-public-transport",
      title: "Demo Persistence Public Transport",
    },
    persistencePolicy: "public",
  });

  const transportChecks = runGeneratedJsonScript(
    targetDir,
    "verify-public-transport.ts",
    `
import { resolveTransportCallOptions } from './src/transport';

(globalThis as typeof globalThis & { window?: unknown }).window = {
location: { origin: 'https://example.test' },
wpApiSettings: {
	nonce: 'wp-fallback-nonce',
	root: 'https://example.test/wp-json/',
},
};

const endpoint = { path: '/demo/v1/state' };
const editorWrite = resolveTransportCallOptions('editor', 'write', endpoint, undefined, {
restNonce: 'explicit-nonce',
transportTarget: 'editor',
});
const frontendWrite = resolveTransportCallOptions('frontend', 'write', endpoint, undefined, {
restNonce: 'explicit-nonce',
transportTarget: 'frontend',
});

console.log(JSON.stringify({
editorWrite: editorWrite.requestOptions,
frontendWrite: frontendWrite.requestOptions,
}));
		`
  ) as {
    editorWrite?: { headers?: Record<string, string>; url?: string };
    frontendWrite?: { headers?: Record<string, string>; url?: string };
  };

  expect(transportChecks.editorWrite?.url).toBeUndefined();
  expect(transportChecks.frontendWrite?.url).toBeUndefined();
  expect(transportChecks.editorWrite?.headers).toBeUndefined();
  expect(transportChecks.frontendWrite?.headers).toBeUndefined();
});

test("generated authenticated persistence transport preserves target defaults and explicit nonce precedence", async () => {
  const targetDir = path.join(tempRoot, "demo-persistence-auth-transport");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: "persistence",
    dataStorageMode: "custom-table",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      dataStorageMode: "custom-table",
      description: "Demo authenticated persistence transport behavior",
      namespace: "create-block",
      persistencePolicy: "authenticated",
      slug: "demo-persistence-auth-transport",
      title: "Demo Persistence Auth Transport",
    },
  });

  const transportChecks = runGeneratedJsonScript(
    targetDir,
    "verify-authenticated-transport.ts",
    `
import { resolveTransportCallOptions } from './src/transport';

(globalThis as typeof globalThis & { window?: unknown }).window = {
location: { origin: 'https://example.test' },
wpApiSettings: {
	nonce: 'wp-fallback-nonce',
	root: 'https://example.test/wp-json/',
},
};

const endpoint = { path: '/demo/v1/state' };
const editorReadDefault = resolveTransportCallOptions('editor', 'read', endpoint);
const editorReadExplicit = resolveTransportCallOptions('editor', 'read', endpoint, undefined, {
restNonce: 'explicit-nonce',
transportTarget: 'editor',
});
const frontendRead = resolveTransportCallOptions('frontend', 'read', endpoint, undefined, {
restNonce: 'ignored-nonce',
transportTarget: 'frontend',
});
const frontendWrite = resolveTransportCallOptions('frontend', 'write', endpoint);

console.log(JSON.stringify({
editorReadDefault: editorReadDefault.requestOptions,
editorReadExplicit: editorReadExplicit.requestOptions,
frontendRead: frontendRead.requestOptions,
frontendWrite: frontendWrite.requestOptions,
}));
		`
  ) as {
    editorReadDefault?: { headers?: Record<string, string>; url?: string };
    editorReadExplicit?: { headers?: Record<string, string>; url?: string };
    frontendRead?: { headers?: Record<string, string>; url?: string };
    frontendWrite?: { headers?: Record<string, string>; url?: string };
  };

  expect(transportChecks.editorReadDefault?.url).toBeUndefined();
  expect(transportChecks.editorReadDefault?.headers?.["X-WP-Nonce"]).toBe(
    "wp-fallback-nonce"
  );
  expect(transportChecks.editorReadExplicit?.headers?.["X-WP-Nonce"]).toBe(
    "explicit-nonce"
  );
  expect(transportChecks.frontendRead?.url).toBeUndefined();
  expect(transportChecks.frontendRead?.headers).toBeUndefined();
  expect(transportChecks.frontendWrite?.url).toBeUndefined();
  expect(transportChecks.frontendWrite?.headers?.["X-WP-Nonce"]).toBe(
    "wp-fallback-nonce"
  );
});

test("generated persistence transport preserves proxy subpaths when overriding base URLs", async () => {
  const targetDir = path.join(tempRoot, "demo-persistence-proxy-subpath");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: "persistence",
    dataStorageMode: "custom-table",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      dataStorageMode: "custom-table",
      description: "Demo persistence proxy subpath transport behavior",
      namespace: "create-block",
      persistencePolicy: "public",
      slug: "demo-persistence-proxy-subpath",
      title: "Demo Persistence Proxy Subpath",
    },
    persistencePolicy: "public",
  });

  replaceGeneratedTransportBaseUrls(
    path.join(targetDir, "src", "transport.ts"),
    "https://example.test/proxy/"
  );

  const transportChecks = runGeneratedJsonScript(
    targetDir,
    "verify-proxy-subpath-transport.ts",
    `
import { resolveTransportCallOptions } from './src/transport';

const endpoint = { path: '/demo/v1/state' };
const editorRead = resolveTransportCallOptions('editor', 'read', endpoint, {
postId: 7,
resourceKey: 'demo',
}, {
transportTarget: 'editor',
});
const frontendWrite = resolveTransportCallOptions('frontend', 'write', endpoint, {
delta: 1,
postId: 7,
resourceKey: 'demo',
}, {
transportTarget: 'frontend',
});

console.log(JSON.stringify({
editorRead: editorRead.requestOptions,
frontendWrite: frontendWrite.requestOptions,
}));
		`
  ) as {
    editorRead?: { url?: string };
    frontendWrite?: { url?: string };
  };

  expect(transportChecks.editorRead?.url).toBe(
    "https://example.test/proxy/demo/v1/state?postId=7&resourceKey=demo"
  );
  expect(transportChecks.frontendWrite?.url).toBe(
    "https://example.test/proxy/demo/v1/state"
  );
});

test("generated persistence transport resolves same-origin relative base URLs", async () => {
  const targetDir = path.join(tempRoot, "demo-persistence-relative-proxy");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: "persistence",
    dataStorageMode: "custom-table",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      dataStorageMode: "custom-table",
      description: "Demo persistence relative proxy transport behavior",
      namespace: "create-block",
      persistencePolicy: "public",
      slug: "demo-persistence-relative-proxy",
      title: "Demo Persistence Relative Proxy",
    },
    persistencePolicy: "public",
  });

  replaceGeneratedTransportBaseUrls(
    path.join(targetDir, "src", "transport.ts"),
    "/proxy/"
  );

  const transportChecks = runGeneratedJsonScript(
    targetDir,
    "verify-relative-proxy-transport.ts",
    `
import { resolveTransportCallOptions } from './src/transport';

(globalThis as typeof globalThis & { window?: unknown }).window = {
location: { origin: 'https://example.test' },
};

const endpoint = { path: '/demo/v1/state' };
const frontendRead = resolveTransportCallOptions('frontend', 'read', endpoint, {
postId: 7,
resourceKey: 'demo',
}, {
transportTarget: 'frontend',
});

console.log(JSON.stringify({
frontendRead: frontendRead.requestOptions,
}));
		`
  ) as {
    frontendRead?: { url?: string };
  };

  expect(transportChecks.frontendRead?.url).toBe(
    "https://example.test/proxy/demo/v1/state?postId=7&resourceKey=demo"
  );
});

test("generated persistence transport preserves query-based WordPress proxy roots", async () => {
  const targetDir = path.join(tempRoot, "demo-persistence-query-proxy");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: "persistence",
    dataStorageMode: "custom-table",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      dataStorageMode: "custom-table",
      description: "Demo persistence query proxy transport behavior",
      namespace: "create-block",
      persistencePolicy: "public",
      slug: "demo-persistence-query-proxy",
      title: "Demo Persistence Query Proxy",
    },
    persistencePolicy: "public",
  });

  replaceGeneratedTransportBaseUrls(
    path.join(targetDir, "src", "transport.ts"),
    "/index.php?rest_route=/proxy/"
  );

  const transportChecks = runGeneratedJsonScript(
    targetDir,
    "verify-query-proxy-transport.ts",
    `
import { resolveTransportCallOptions } from './src/transport';

(globalThis as typeof globalThis & { window?: unknown }).window = {
location: { origin: 'https://example.test' },
};

const endpoint = { path: '/demo/v1/state' };
const frontendRead = resolveTransportCallOptions('frontend', 'read', endpoint, {
postId: 7,
resourceKey: 'demo',
}, {
transportTarget: 'frontend',
});

console.log(JSON.stringify({
frontendRead: frontendRead.requestOptions,
}));
		`
  ) as {
    frontendRead?: { url?: string };
  };

  expect(transportChecks.frontendRead?.url).toBe(
    "https://example.test/index.php?rest_route=%2Fproxy%2Fdemo%2Fv1%2Fstate&postId=7&resourceKey=demo"
  );
});

test(
  "generated persistence transport can point at a local adapter stub by editing only src/transport.ts",
  async () => {
    const targetDir = path.join(
      tempRoot,
      "demo-persistence-adapter-transport"
    );
    const adapterServer = await startLocalCounterStubServer();

    try {
      await scaffoldProject({
        projectDir: targetDir,
        templateId: "persistence",
        dataStorageMode: "custom-table",
        packageManager: "npm",
        noInstall: true,
        answers: {
          author: "Test Runner",
          dataStorageMode: "custom-table",
          description: "Demo adapter-backed persistence transport",
          namespace: "persistence-examples",
          persistencePolicy: "public",
          slug: "counter",
          title: "Persistence Counter",
        },
        persistencePolicy: "public",
      });

      runGeneratedScript(targetDir, "scripts/sync-project.ts");
      replaceGeneratedTransportBaseUrls(
        path.join(targetDir, "src", "transport.ts"),
        adapterServer.url
      );

      const integrationResult = (await runGeneratedJsonScriptAsync(
        targetDir,
        "verify-adapter-transport.ts",
        `
import openApiDocument from './src/api.openapi.json';
import { resolveTransportCallOptions } from './src/transport';

const statePath = Object.keys(openApiDocument.paths).find((candidatePath) =>
candidatePath.endsWith('/state')
);
const bootstrapPath = Object.keys(openApiDocument.paths).find((candidatePath) =>
candidatePath.endsWith('/bootstrap')
);
if (typeof statePath !== 'string') {
throw new Error('Unable to resolve the generated state route path.');
}
if (typeof bootstrapPath !== 'string') {
throw new Error('Unable to resolve the generated bootstrap route path.');
}

const readOptions = resolveTransportCallOptions(
'frontend',
'read',
{ path: statePath },
{
	postId: 7,
	resourceKey: 'demo',
},
{ transportTarget: 'frontend' },
);
const bootstrapOptions = resolveTransportCallOptions(
'frontend',
'read',
{ path: bootstrapPath },
{
	postId: 7,
	resourceKey: 'demo',
},
{ transportTarget: 'frontend' },
);
const bootstrapResponse = await fetch(
bootstrapOptions.requestOptions?.url ?? '',
{
	headers: bootstrapOptions.requestOptions?.headers as HeadersInit | undefined,
},
);
const bootstrap = await bootstrapResponse.json();
const publicWriteRequestId = 'adapter-request-1';
const publicWriteToken =
	typeof bootstrap.publicWriteToken === 'string'
		? bootstrap.publicWriteToken
		: '';
const writeOptions = resolveTransportCallOptions(
'frontend',
'write',
{ path: statePath },
{
	delta: 2,
	postId: 7,
	publicWriteRequestId,
	publicWriteToken,
	resourceKey: 'demo',
},
{ transportTarget: 'frontend' },
);

const initialResponse = await fetch(
readOptions.requestOptions?.url ?? '',
{
	headers: readOptions.requestOptions?.headers as HeadersInit | undefined,
},
);
const initial = await initialResponse.json();
const updatedResponse = await fetch(
writeOptions.requestOptions?.url ?? '',
{
	body: JSON.stringify({
		delta: 2,
		postId: 7,
		publicWriteRequestId,
		publicWriteToken,
		resourceKey: 'demo',
	}),
	headers: {
		'content-type': 'application/json',
		...(writeOptions.requestOptions?.headers as Record<string, string> | undefined),
	},
	method: 'POST',
},
);
const updated = await updatedResponse.json();
const rereadResponse = await fetch(
readOptions.requestOptions?.url ?? '',
{
	headers: readOptions.requestOptions?.headers as HeadersInit | undefined,
},
);
const reread = await rereadResponse.json();

console.log(JSON.stringify({ initial, updated, reread }));
				`
      )) as {
        initial: {
          count: number;
          postId: number;
          resourceKey: string;
          storage: string;
        };
        reread: {
          count: number;
          postId: number;
          resourceKey: string;
          storage: string;
        };
        updated: {
          count: number;
          postId: number;
          resourceKey: string;
          storage: string;
        };
      };

      expect(integrationResult.initial).toEqual({
        count: 0,
        postId: 7,
        resourceKey: "demo",
        storage: "custom-table",
      });
      expect(integrationResult.updated).toEqual({
        count: 2,
        postId: 7,
        resourceKey: "demo",
        storage: "custom-table",
      });
      expect(integrationResult.reread).toEqual({
        count: 2,
        postId: 7,
        resourceKey: "demo",
        storage: "custom-table",
      });
    } finally {
      await adapterServer.close();
    }
  },
  { timeout: 20_000 }
);

test("scaffoldProject supports explicit text-domain overrides on persistence templates", async () => {
  const targetDir = path.join(tempRoot, "demo-persistence-text-domain");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: "persistence",
    dataStorageMode: "custom-table",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      dataStorageMode: "custom-table",
      description: "Demo persistence text domain block",
      namespace: "create-block",
      persistencePolicy: "authenticated",
      slug: "demo-persistence-text-domain",
      textDomain: "demo-custom-text-domain",
      title: "Demo Persistence Text Domain",
    },
  });

  const blockJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "src", "block.json"), "utf8")
  );
  const pluginBootstrap = fs.readFileSync(
    path.join(targetDir, "demo-persistence-text-domain.php"),
    "utf8"
  );

  expect(blockJson.name).toBe("create-block/demo-persistence-text-domain");
  expect(blockJson.textdomain).toBe("demo-custom-text-domain");
  expect(pluginBootstrap).toContain(
    "Text Domain:       demo-custom-text-domain"
  );
  expect(pluginBootstrap).toContain(
    "function demo_persistence_text_domain_get_counter"
  );
});

test("scaffoldProject supports explicit php-prefix overrides on persistence templates", async () => {
  const targetDir = path.join(tempRoot, "demo-persistence-php-prefix");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: "persistence",
    dataStorageMode: "custom-table",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      dataStorageMode: "custom-table",
      description: "Demo persistence php prefix block",
      namespace: "create-block",
      persistencePolicy: "authenticated",
      phpPrefix: "custom_counter_prefix",
      slug: "demo-persistence-php-prefix",
      title: "Demo Persistence Php Prefix",
    },
  });

  const blockJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "src", "block.json"), "utf8")
  );
  const pluginBootstrap = fs.readFileSync(
    path.join(targetDir, "demo-persistence-php-prefix.php"),
    "utf8"
  );

  expect(blockJson.textdomain).toBe("demo-persistence-php-prefix");
  expect(pluginBootstrap).toContain(
    "Text Domain:       demo-persistence-php-prefix"
  );
  expect(pluginBootstrap).toContain(
    "function custom_counter_prefix_get_counter"
  );
  expect(pluginBootstrap).toContain("custom_counter_prefix_storage_version");
});

test("scaffoldProject rejects overly long php-prefix overrides", async () => {
  const targetDir = path.join(
    tempRoot,
    "demo-persistence-php-prefix-too-long"
  );

  await expect(
    scaffoldProject({
      projectDir: targetDir,
      templateId: "persistence",
      dataStorageMode: "custom-table",
      packageManager: "npm",
      noInstall: true,
      answers: {
        author: "Test Runner",
        dataStorageMode: "custom-table",
        description: "Demo persistence php prefix length guard",
        namespace: "create-block",
        persistencePolicy: "authenticated",
        phpPrefix: "a".repeat(51),
        slug: "demo-persistence-php-prefix-too-long",
        title: "Demo Persistence Php Prefix Too Long",
      },
    })
  ).rejects.toThrow("Use 50 characters or fewer");
});

test("scaffoldProject supports combined identifier overrides on persistence templates", async () => {
  const targetDir = path.join(tempRoot, "demo-persistence-identifiers");

  await scaffoldProject({
    projectDir: targetDir,
    templateId: "persistence",
    dataStorageMode: "post-meta",
    packageManager: "npm",
    noInstall: true,
    answers: {
      author: "Test Runner",
      dataStorageMode: "post-meta",
      description: "Demo persistence identifier overrides",
      namespace: "experiments",
      persistencePolicy: "public",
      phpPrefix: "ab_test_metrics",
      slug: "demo-persistence-identifiers",
      textDomain: "demo-persistence-text",
      title: "Demo Persistence Identifiers",
    },
    persistencePolicy: "public",
  });

  const blockJson = JSON.parse(
    fs.readFileSync(path.join(targetDir, "src", "block.json"), "utf8")
  );
  const pluginBootstrap = fs.readFileSync(
    path.join(targetDir, "demo-persistence-identifiers.php"),
    "utf8"
  );
  const restPublicHelper = fs.readFileSync(
    path.join(targetDir, "inc", "rest-public.php"),
    "utf8"
  );

  expect(blockJson.name).toBe("experiments/demo-persistence-identifiers");
  expect(blockJson.textdomain).toBe("demo-persistence-text");
  expect(pluginBootstrap).toContain(
    "Text Domain:       demo-persistence-text"
  );
  expect(pluginBootstrap).toContain("function ab_test_metrics_get_counter");
  expect(pluginBootstrap).toContain(
    "define( 'AB_TEST_METRICS_DATA_STORAGE_MODE', 'post-meta' );"
  );
  expect(pluginBootstrap).toContain(
    "if ( 'custom-table' !== AB_TEST_METRICS_DATA_STORAGE_MODE )"
  );
  expect(pluginBootstrap).toContain(
    "'storage'     => AB_TEST_METRICS_DATA_STORAGE_MODE,"
  );
  expect(restPublicHelper).toContain(
    "function ab_test_metrics_create_public_write_token"
  );
});
});
