import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const runtimeRoot = path.join(import.meta.dir, "..", "src", "runtime", "templates");

test("built-in non-ts artifacts delegate family emitters and render helpers to focused modules", () => {
	const facadeSource = fs.readFileSync(
		path.join(runtimeRoot, "built-in-block-non-ts-artifacts.ts"),
		"utf8",
	);
	const familySource = fs.readFileSync(
		path.join(runtimeRoot, "built-in-block-non-ts-family-artifacts.ts"),
		"utf8",
	);
	const basicSource = fs.readFileSync(
		path.join(runtimeRoot, "built-in-block-non-ts-basic-artifacts.ts"),
		"utf8",
	);
	const interactivitySource = fs.readFileSync(
		path.join(runtimeRoot, "built-in-block-non-ts-interactivity-artifacts.ts"),
		"utf8",
	);
	const persistenceSource = fs.readFileSync(
		path.join(runtimeRoot, "built-in-block-non-ts-persistence-artifacts.ts"),
		"utf8",
	);
	const persistenceTemplatesSource = fs.readFileSync(
		path.join(runtimeRoot, "built-in-block-non-ts-persistence-templates.ts"),
		"utf8",
	);
	const compoundSource = fs.readFileSync(
		path.join(runtimeRoot, "built-in-block-non-ts-compound-artifacts.ts"),
		"utf8",
	);
	const compoundTemplatesSource = fs.readFileSync(
		path.join(runtimeRoot, "built-in-block-non-ts-compound-templates.ts"),
		"utf8",
	);
	const renderUtilsSource = fs.readFileSync(
		path.join(runtimeRoot, "built-in-block-non-ts-render-utils.ts"),
		"utf8",
	);

	expect(facadeSource).toContain(
		'from "./built-in-block-non-ts-family-artifacts.js"',
	);
	expect(facadeSource).toContain("buildBasicArtifacts");
	expect(facadeSource).not.toContain("const BASIC_STYLE_TEMPLATE =");
	expect(facadeSource).not.toContain("function renderArtifact(");
	expect(familySource).toContain(
		'from "./built-in-block-non-ts-basic-artifacts.js"',
	);
	expect(familySource).toContain(
		'from "./built-in-block-non-ts-compound-artifacts.js"',
	);
	expect(familySource).toContain(
		'from "./built-in-block-non-ts-interactivity-artifacts.js"',
	);
	expect(familySource).toContain(
		'from "./built-in-block-non-ts-persistence-artifacts.js"',
	);
	expect(familySource).not.toContain("const BASIC_STYLE_TEMPLATE =");
	expect(basicSource).toContain("const BASIC_STYLE_TEMPLATE =");
	expect(basicSource).toContain("export function buildBasicArtifacts(");
	expect(interactivitySource).toContain(
		"const INTERACTIVITY_STYLE_TEMPLATE =",
	);
	expect(interactivitySource).toContain(
		"export function buildInteractivityArtifacts(",
	);
	expect(persistenceSource).toContain(
		'from "./built-in-block-non-ts-persistence-templates.js"',
	);
	expect(persistenceSource).toContain(
		"export function buildPersistenceArtifacts(",
	);
	expect(persistenceSource).not.toContain(
		"const PERSISTENCE_RENDER_TARGETS_TEMPLATE =",
	);
	expect(persistenceSource).not.toContain("const PERSISTENCE_RENDER_TEMPLATE =");
	expect(persistenceTemplatesSource).toContain(
		"export const PERSISTENCE_RENDER_TARGETS_TEMPLATE =",
	);
	expect(persistenceTemplatesSource).toContain(
		"export const PERSISTENCE_RENDER_TEMPLATE =",
	);
	expect(persistenceTemplatesSource).toContain(
		"export const PERSISTENCE_STYLE_TEMPLATE =",
	);
	expect(compoundSource).toContain(
		'from "./built-in-block-non-ts-compound-templates.js"',
	);
	expect(compoundSource).toContain("export function buildCompoundArtifacts(");
	expect(compoundSource).toContain(
		'from "./built-in-block-non-ts-render-utils.js"',
	);
	expect(compoundSource).not.toContain(
		"const COMPOUND_PERSISTENCE_RENDER_TARGETS_TEMPLATE =",
	);
	expect(compoundSource).not.toContain(
		"const COMPOUND_PERSISTENCE_RENDER_TEMPLATE =",
	);
	expect(compoundTemplatesSource).toContain(
		"export const COMPOUND_PERSISTENCE_RENDER_TARGETS_TEMPLATE =",
	);
	expect(compoundTemplatesSource).toContain(
		"export const COMPOUND_PERSISTENCE_RENDER_TEMPLATE =",
	);
	expect(compoundTemplatesSource).toContain(
		"export const COMPOUND_STYLE_TEMPLATE =",
	);
	expect(renderUtilsSource).toContain("export function renderArtifact(");
	expect(renderUtilsSource).toContain(
		"export function buildAlternateRenderEntryArtifact(",
	);
	expect(renderUtilsSource).toContain("export function toPhpSingleQuotedString(");
});
