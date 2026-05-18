import type {
	ScaffoldTemplateVariables,
} from "./scaffold.js";
import { isCompoundPersistenceEnabled } from "./scaffold-template-variable-groups.js";

interface AttributeDescription {
	lines: string[];
}

interface EmittedAttributeDefinition {
	description?: AttributeDescription;
	name: string;
	optional: boolean;
	typeExpression: string;
}

interface InterfaceMemberDefinition {
	description?: AttributeDescription;
	name: string;
	optional?: boolean;
	typeExpression: string;
}

interface InterfaceDefinition {
	description?: AttributeDescription;
	members: InterfaceMemberDefinition[];
	name: string;
}

interface TypeAliasDefinition {
	name: string;
	value: string;
}

const STANDARD_PREAMBLE_LINES = [
	'import type { TextAlignment } from "@wp-typia/block-types/block-editor/alignment";',
	"import type {",
	"\tTypiaValidationError,",
	"\tValidationResult,",
	'} from "@wp-typia/block-runtime/validation";',
	'import { tags } from "typia";',
	"",
	'export type { TypiaValidationError, ValidationResult } from "@wp-typia/block-runtime/validation";',
] as const satisfies readonly string[];

const VALIDATION_ONLY_PREAMBLE_LINES = [
	'import type { ValidationResult } from "@wp-typia/block-runtime/validation";',
	'import { tags } from "typia";',
	"",
	'export type { ValidationResult } from "@wp-typia/block-runtime/validation";',
] as const satisfies readonly string[];

function emitDocComment(
	description: AttributeDescription | undefined,
	indent = "",
): string[] {
	if (!description) {
		return [];
	}

	return [
		`${indent}/**`,
		...description.lines.map((line) =>
			line.length === 0 ? `${indent} *` : `${indent} * ${line}`,
		),
		`${indent} */`,
	];
}

function emitInterface(definition: InterfaceDefinition): string[] {
	const lines = [
		...emitDocComment(definition.description),
		`export interface ${definition.name} {`,
	];

	for (const member of definition.members) {
		lines.push(...emitDocComment(member.description, "\t"));
		lines.push(
			`\t${member.name}${member.optional ? "?" : ""}: ${member.typeExpression};`,
		);
	}

	lines.push("}");
	return lines;
}

function emitTypesModule({
	preambleLines,
	interfaces,
	typeAliases,
}: {
	preambleLines: string[];
	interfaces: InterfaceDefinition[];
	typeAliases: TypeAliasDefinition[];
}): string {
	const sections: string[] = [];

	if (preambleLines.length > 0) {
		sections.push(preambleLines.join("\n"));
	}

	for (const definition of interfaces) {
		sections.push(emitInterface(definition).join("\n"));
	}

	if (typeAliases.length > 0) {
		sections.push(
			typeAliases
				.map((alias) => `export type ${alias.name} = ${alias.value};`)
				.join("\n"),
		);
	}

	return `${sections.join("\n\n")}\n`;
}

/**
 * Builds the generated attributes and validation type source for a basic block scaffold.
 *
 * @param variables Resolved scaffold template variables used to name emitted types.
 * @param attributes Emitted built-in attribute definitions that drive the interface members.
 * @returns TypeScript source for the basic block attribute and validation types.
 */
export function buildBasicTypesSource(
	variables: ScaffoldTemplateVariables,
	attributes: readonly EmittedAttributeDefinition[],
): string {
	return emitTypesModule({
		preambleLines: [...STANDARD_PREAMBLE_LINES],
		interfaces: [
			{
				description: {
					lines: [
						"Block attributes interface",
						"Typia tags define runtime validation rules",
					],
				},
				members: attributes.map((attribute) => ({
					description: attribute.description,
					name: attribute.name,
					optional: attribute.optional,
					typeExpression: attribute.typeExpression,
				})),
				name: `${variables.pascalCase}Attributes`,
			},
		],
		typeAliases: [
			{
				name: `${variables.pascalCase}ValidationResult`,
				value: `ValidationResult<${variables.pascalCase}Attributes>`,
			},
		],
	});
}

/**
 * Builds the generated attributes, context, and validation type source for an interactivity scaffold.
 *
 * @param variables Resolved scaffold template variables used to name emitted types.
 * @param attributes Emitted built-in attribute definitions that drive the interface members.
 * @returns TypeScript source for the interactivity block attribute, context, and validation types.
 */
export function buildInteractivityTypesSource(
	variables: ScaffoldTemplateVariables,
	attributes: readonly EmittedAttributeDefinition[],
): string {
	return emitTypesModule({
		preambleLines: [...STANDARD_PREAMBLE_LINES],
		interfaces: [
			{
				members: attributes.map((attribute) => ({
					name: attribute.name,
					optional: attribute.optional,
					typeExpression: attribute.typeExpression,
				})),
				name: `${variables.pascalCase}Attributes`,
			},
			{
				members: [
					{ name: "clicks", typeExpression: "number" },
					{ name: "isAnimating", typeExpression: "boolean" },
					{ name: "isVisible", typeExpression: "boolean" },
					{
						name: "animation",
						typeExpression: '"none" | "bounce" | "pulse" | "shake" | "flip"',
					},
					{ name: "maxClicks", typeExpression: "number" },
				],
				name: `${variables.pascalCase}Context`,
			},
			{
				members: [
					{ name: "clicks", typeExpression: "number" },
					{ name: "isAnimating", typeExpression: "boolean" },
					{ name: "isVisible", typeExpression: "boolean" },
					{ name: "progress", typeExpression: "number" },
					{ name: "clampedClicks", typeExpression: "number" },
					{ name: "isComplete", typeExpression: "boolean" },
				],
				name: `${variables.pascalCase}State`,
			},
		],
		typeAliases: [
			{
				name: `${variables.pascalCase}ValidationResult`,
				value: `ValidationResult<${variables.pascalCase}Attributes>`,
			},
		],
	});
}

/**
 * Builds the generated attributes, context, state, client, and validation type source for a persistence scaffold.
 *
 * @param variables Resolved scaffold template variables used to name emitted types.
 * @param attributes Emitted built-in attribute definitions that drive the interface members.
 * @returns TypeScript source for the persistence block runtime types.
 */
export function buildPersistenceTypesSource(
	variables: ScaffoldTemplateVariables,
	attributes: readonly EmittedAttributeDefinition[],
): string {
	return emitTypesModule({
		preambleLines: [...STANDARD_PREAMBLE_LINES],
		interfaces: [
			{
				members: attributes.map((attribute) => ({
					name: attribute.name,
					optional: attribute.optional,
					typeExpression: attribute.typeExpression,
				})),
				name: `${variables.pascalCase}Attributes`,
			},
			{
				members: [
					{ name: "buttonLabel", typeExpression: "string" },
					{ name: "bootstrapReady", typeExpression: "boolean" },
					{ name: "canWrite", typeExpression: "boolean" },
					{ name: "count", typeExpression: "number" },
					{ name: "error", typeExpression: "string" },
					{ name: "isBootstrapping", typeExpression: "boolean" },
					{ name: "isLoading", typeExpression: "boolean" },
					{ name: "isSaving", typeExpression: "boolean" },
					{
						name: "persistencePolicy",
						typeExpression: '"authenticated" | "public"',
					},
					{ name: "postId", typeExpression: "number" },
					{ name: "resourceKey", typeExpression: "string" },
					{
						name: "storage",
						typeExpression: '"post-meta" | "custom-table"',
					},
					{ name: "isVisible", typeExpression: "boolean" },
					{
						name: "client",
						optional: true,
						typeExpression: `${variables.pascalCase}ClientState`,
					},
				],
				name: `${variables.pascalCase}Context`,
			},
			{
				members: [{ name: "isHydrated", typeExpression: "boolean" }],
				name: `${variables.pascalCase}State`,
			},
			{
				members: [
					{ name: "bootstrapError", typeExpression: "string" },
					{ name: "writeExpiry", typeExpression: "number" },
					{ name: "writeNonce", typeExpression: "string" },
					{ name: "writeToken", typeExpression: "string" },
				],
				name: `${variables.pascalCase}ClientState`,
			},
		],
		typeAliases: [
			{
				name: `${variables.pascalCase}ValidationResult`,
				value: `ValidationResult<${variables.pascalCase}Attributes>`,
			},
		],
	});
}

/**
 * Builds the generated attributes and optional persistence runtime type source for a compound parent scaffold.
 *
 * @param variables Resolved scaffold template variables used to name emitted types.
 * @param attributes Emitted built-in attribute definitions that drive the interface members.
 * @returns TypeScript source for the compound parent runtime types.
 */
export function buildCompoundTypesSource(
	variables: ScaffoldTemplateVariables,
	attributes: readonly EmittedAttributeDefinition[],
): string {
	const persistenceEnabled = isCompoundPersistenceEnabled(variables);

	return emitTypesModule({
		preambleLines: persistenceEnabled
			? [...STANDARD_PREAMBLE_LINES]
			: [...VALIDATION_ONLY_PREAMBLE_LINES],
		interfaces: [
			{
				members: attributes.map((attribute) => ({
					name: attribute.name,
					optional: attribute.optional,
					typeExpression: attribute.typeExpression,
				})),
				name: `${variables.pascalCase}Attributes`,
			},
			...(persistenceEnabled
				? [
						{
							members: [
								{ name: "buttonLabel", typeExpression: "string" },
								{ name: "bootstrapReady", typeExpression: "boolean" },
								{ name: "canWrite", typeExpression: "boolean" },
								{ name: "count", typeExpression: "number" },
								{ name: "error", typeExpression: "string" },
								{ name: "isBootstrapping", typeExpression: "boolean" },
								{ name: "isLoading", typeExpression: "boolean" },
								{ name: "isSaving", typeExpression: "boolean" },
								{
									name: "persistencePolicy",
									typeExpression: '"authenticated" | "public"',
								},
								{ name: "postId", typeExpression: "number" },
								{ name: "resourceKey", typeExpression: "string" },
								{ name: "showCount", typeExpression: "boolean" },
								{
									name: "storage",
									typeExpression: '"post-meta" | "custom-table"',
								},
								{
									name: "client",
									optional: true,
									typeExpression: `${variables.pascalCase}ClientState`,
								},
							],
							name: `${variables.pascalCase}Context`,
						},
						{
							members: [{ name: "isHydrated", typeExpression: "boolean" }],
							name: `${variables.pascalCase}State`,
						},
						{
							members: [
								{ name: "bootstrapError", typeExpression: "string" },
								{ name: "writeExpiry", typeExpression: "number" },
								{ name: "writeNonce", typeExpression: "string" },
								{ name: "writeToken", typeExpression: "string" },
							],
							name: `${variables.pascalCase}ClientState`,
						},
					]
				: []),
		],
		typeAliases: [
			{
				name: `${variables.pascalCase}ValidationResult`,
				value: `ValidationResult<${variables.pascalCase}Attributes>`,
			},
		],
	});
}

/**
 * Builds the generated attributes and validation type source for a compound child scaffold.
 *
 * @param variables Resolved scaffold template variables used to name emitted types.
 * @param attributes Emitted built-in attribute definitions that drive the interface members.
 * @returns TypeScript source for the compound child attribute and validation types.
 */
export function buildCompoundChildTypesSource(
	variables: ScaffoldTemplateVariables,
	attributes: readonly EmittedAttributeDefinition[],
): string {
	return emitTypesModule({
		preambleLines: [...VALIDATION_ONLY_PREAMBLE_LINES],
		interfaces: [
			{
				members: attributes.map((attribute) => ({
					name: attribute.name,
					optional: attribute.optional,
					typeExpression: attribute.typeExpression,
				})),
				name: `${variables.pascalCase}ItemAttributes`,
			},
		],
		typeAliases: [
			{
				name: `${variables.pascalCase}ItemValidationResult`,
				value: `ValidationResult<${variables.pascalCase}ItemAttributes>`,
			},
		],
	});
}
