import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ensureRestResourceBootstrapAnchors,
  ensureRestSchemaHelperBootstrapAnchors,
} from '../src/runtime/cli-add-workspace-rest-bootstrap-anchors.js';
import type { WorkspaceProject } from '../src/runtime/workspace-project.js';

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'wp-typia-rest-bootstrap-anchors-'),
);

afterAll(() => {
  fs.rmSync(tempRoot, { force: true, recursive: true });
});

function createWorkspaceFixture(bootstrapSource: string): WorkspaceProject {
  const projectDir = fs.mkdtempSync(path.join(tempRoot, 'workspace-'));
  fs.writeFileSync(
    path.join(projectDir, 'demo-workspace.php'),
    bootstrapSource,
    'utf8',
  );

  return {
    author: 'Demo',
    packageManager: 'npm',
    packageName: 'demo-workspace',
    projectDir,
    workspace: {
      namespace: 'demo/v1',
      phpPrefix: 'demo_space',
      projectType: 'workspace',
      templatePackage: '@wp-typia/create-workspace-template',
      textDomain: 'demo',
    },
  };
}

test('REST schema helper bootstrap validation inspects the existing loader body', async () => {
	const workspace = createWorkspaceFixture(`<?php
// The expected helper path may appear elsewhere without making the loader valid.
// /inc/rest-schema.php
function demo_space_load_rest_schema_helpers() {
\t$helper_path = __DIR__ . '/inc/not-rest-schema.php';
}
demo_space_load_rest_schema_helpers();
`);

	await expect(ensureRestSchemaHelperBootstrapAnchors(workspace)).rejects.toThrow(
		'does not include /inc/rest-schema.php',
	);
});

test('REST schema helper bootstrap validation accepts spaced PHP function declarations', async () => {
	const workspace = createWorkspaceFixture(`<?php
function demo_space_load_rest_schema_helpers () {
\t$helper_path = __DIR__ . '/inc/rest-schema.php';
\tif ( is_readable( $helper_path ) ) {
\t\trequire_once $helper_path;
\t}
}

demo_space_load_rest_schema_helpers();
`);

	await expect(ensureRestSchemaHelperBootstrapAnchors(workspace)).resolves.toBe(
		undefined,
	);
});

test('REST resource bootstrap migration replaces the generated glob loader', async () => {
	const workspace = createWorkspaceFixture(`<?php
function demo_space_register_rest_resources() {
\tforeach ( glob( __DIR__ . '/inc/rest/*.php' ) ?: array() as $rest_resource_module ) {
\t\trequire_once $rest_resource_module;
\t}
}
add_action( 'init', 'demo_space_register_rest_resources', 20 );
`);

	await expect(ensureRestResourceBootstrapAnchors(workspace)).resolves.toBe(
		undefined,
	);
	const bootstrapSource = fs.readFileSync(
		path.join(workspace.projectDir, 'demo-workspace.php'),
		'utf8',
	);
	expect(bootstrapSource).toContain(
		"require_once __DIR__ . '/inc/rest/wp-typia-modules.php';",
	);
	expect(bootstrapSource).not.toContain('/inc/rest/*.php');
});

test('REST resource bootstrap validation accepts spaced PHP function declarations', async () => {
	const workspace = createWorkspaceFixture(`<?php
function demo_space_register_rest_resources () {
\trequire_once __DIR__ . '/inc/rest/wp-typia-modules.php';
}

add_action( 'init', 'demo_space_register_rest_resources', 20 );
`);

	await expect(ensureRestResourceBootstrapAnchors(workspace)).resolves.toBe(
		undefined,
	);
});

test('REST resource bootstrap migration preserves customized loaders', async () => {
	const source = `<?php
function demo_space_register_rest_resources() {
	foreach ( glob( __DIR__ . '/inc/rest/*.php' ) ?: array() as $rest_resource_module ) {
\t\trequire_once $rest_resource_module;
\t}
\tdemo_space_register_custom_rest_resources();
}
add_action( 'init', 'demo_space_register_rest_resources', 20 );
`;
	const workspace = createWorkspaceFixture(source);

	await expect(ensureRestResourceBootstrapAnchors(workspace)).rejects.toThrow(
		'Unable to migrate customized demo_space_register_rest_resources()',
	);
	expect(
		fs.readFileSync(
			path.join(workspace.projectDir, 'demo-workspace.php'),
			'utf8',
		),
	).toBe(source);
});
