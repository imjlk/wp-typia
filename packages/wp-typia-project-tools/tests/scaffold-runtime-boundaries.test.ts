import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const runtimeRoot = path.join(
  import.meta.dir,
  '..',
  'src',
  'runtime',
  'templates',
);

test('scaffold runtime delegates identifier, document, bootstrap, and package helpers to focused modules', () => {
	const scaffoldSource = fs.readFileSync(
		path.join(runtimeRoot, 'scaffold.ts'),
		'utf8',
	);
	const identifiersSource = fs.readFileSync(
		path.join(runtimeRoot, 'scaffold-identifiers.ts'),
		'utf8',
	);
	const applyUtilsSource = fs.readFileSync(
		path.join(runtimeRoot, 'scaffold-apply-utils.ts'),
		'utf8',
	);
	const documentsSource = fs.readFileSync(
		path.join(runtimeRoot, 'scaffold-documents.ts'),
		'utf8',
	);
	const bootstrapSource = fs.readFileSync(
		path.join(runtimeRoot, 'scaffold-bootstrap.ts'),
		'utf8',
	);
	const packageManagerFilesSource = fs.readFileSync(
		path.join(runtimeRoot, 'scaffold-package-manager-files.ts'),
		'utf8',
	);
	const documentsReExportPattern =
		/export\s*\{(?=[^}]*\bbuildGitignore\b)(?=[^}]*\bbuildReadme\b)(?=[^}]*\bmergeTextLines\b)[^}]*\}\s*from\s*"\.\/scaffold-documents\.js";/u;

	expect(scaffoldSource).toContain('from "./scaffold-identifiers.js"');
	expect(scaffoldSource).toContain('from "./scaffold-apply-utils.js"');
	expect(scaffoldSource).toContain('from "./scaffold-bootstrap.js"');
	expect(scaffoldSource).toContain('from "./scaffold-package-manager-files.js"');
	expect(scaffoldSource).not.toContain(
		'import {\n} from "./scaffold-answer-resolution.js";',
	);
	expect(scaffoldSource).toContain(
		'export { buildBlockCssClassName } from "./scaffold-identifiers.js";',
	);
	expect(scaffoldSource).not.toContain('function validateBlockSlug(');
	expect(scaffoldSource).not.toContain('function validateNamespace(');
	expect(scaffoldSource).not.toContain('function validatePhpPrefix(');
	expect(scaffoldSource).not.toContain('function buildReadme(');
	expect(scaffoldSource).not.toContain('function buildGitignore(');
	expect(scaffoldSource).not.toContain('function mergeTextLines(');
	expect(scaffoldSource).not.toContain('async function ensureDirectory(');
	expect(scaffoldSource).not.toContain('async function normalizePackageJson(');
	expect(identifiersSource).toContain('export function validateBlockSlug(');
	expect(identifiersSource).toContain(
		'export function resolveScaffoldIdentifiers(',
	);
	expect(documentsReExportPattern.test(applyUtilsSource)).toBe(true);
	expect(applyUtilsSource).toContain('from "./scaffold-package-manager-files.js"');
	expect(applyUtilsSource).toContain('from "./scaffold-bootstrap.js"');
	expect(applyUtilsSource).not.toContain(
		'export async function applyWorkspaceMigrationCapability(',
	);
	expect(applyUtilsSource).not.toContain('async function normalizePackageJson(');
	expect(documentsSource).toContain('export function buildReadme(');
	expect(documentsSource).toContain('export function buildGitignore(');
	expect(documentsSource).toContain('export function mergeTextLines(');
	expect(bootstrapSource).toContain('export async function ensureScaffoldDirectory(');
	expect(bootstrapSource).toContain('export async function applyWorkspaceMigrationCapability(');
	expect(bootstrapSource).toContain('from "../shared/package-json-types.js"');
	expect(packageManagerFilesSource).toContain(
		'from "../shared/package-json-types.js"',
	);
	expect(packageManagerFilesSource).toContain('export async function normalizePackageJson(');
	expect(packageManagerFilesSource).toContain('export async function defaultInstallDependencies(');
});
