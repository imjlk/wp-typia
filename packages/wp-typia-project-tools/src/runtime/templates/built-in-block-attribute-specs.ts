import type { ScaffoldTemplateVariables } from "./scaffold.js";
import { isCompoundPersistenceEnabled } from "./scaffold-template-variable-groups.js";
import {
	DEFAULT_COMPOUND_CHILD_BODY_PLACEHOLDER,
	buildAttributesFromSpecs,
	describe,
} from "./built-in-block-attribute-emitters.js";
import type {
	BuiltInAttributeTemplateSpec,
	EmittedAttributeDefinition,
} from "./built-in-block-attribute-emitters.js";

const ALIGNMENT_VALUES = ["left", "center", "right"] as const;
const BASIC_ALIGNMENT_VALUES = ["left", "center", "right", "justify"] as const;
const INTERACTIVE_MODE_VALUES = ["click", "hover"] as const;
const ANIMATION_VALUES = ["none", "bounce", "pulse", "shake", "flip"] as const;
interface CompoundChildAttributeVariables {
	bodyPlaceholder: string;
	childCssClassName?: string | null;
	childTitle: string;
}
const BASIC_ATTRIBUTE_SPECS = [
	{
		attributeType: "string",
		constraints: {
			maxLength: 1000,
		},
		defaultValue: "",
		description: describe("Main block content"),
		name: "content",
		optional: false,
		typeExpression: 'string & tags.MaxLength<1000> & tags.Default<"">',
	},
	{
		attributeType: "string",
		defaultValue: "left",
		description: describe("Alignment"),
		enumValues: [...BASIC_ALIGNMENT_VALUES],
		name: "alignment",
		optional: true,
		typeExpression: 'TextAlignment & tags.Default<"left">',
	},
	{
		attributeType: "boolean",
		defaultValue: true,
		description: describe("Visibility toggle"),
		name: "isVisible",
		optional: true,
		typeExpression: "boolean & tags.Default<true>",
	},
	{
		attributeType: "string",
		constraints: {
			maxLength: 100,
		},
		defaultValue: "",
		description: describe("Custom CSS class"),
		name: "className",
		optional: true,
		typeExpression: 'string & tags.MaxLength<100> & tags.Default<"">',
	},
	{
		attributeType: "string",
		constraints: {
			format: "uuid",
		},
		description: describe("Generated runtime ID"),
		name: "id",
		optional: true,
		typeExpression: 'string & tags.Format<"uuid">',
	},
	{
		attributeType: "number",
		constraints: {
			typeTag: "uint32",
		},
		defaultValue: 1,
		description: describe("Block version for migrations"),
		name: "schemaVersion",
		optional: true,
		typeExpression: 'number & tags.Type<"uint32"> & tags.Default<1>',
	},
] as const satisfies readonly BuiltInAttributeTemplateSpec<void>[];

const INTERACTIVITY_ATTRIBUTE_SPECS = [
	{
		attributeType: "string",
		constraints: {
			maxLength: 1000,
		},
		defaultValue: "",
		name: "content",
		optional: false,
		selector: (variables: ScaffoldTemplateVariables) =>
			`.${variables.cssClassName}__content`,
		source: "html",
		typeExpression: 'string & tags.MaxLength<1000> & tags.Default<"">',
	},
	{
		attributeType: "string",
		defaultValue: "left",
		enumValues: [...ALIGNMENT_VALUES],
		name: "alignment",
		optional: true,
		typeExpression: 'TextAlignment & tags.Default<"left">',
	},
	{
		attributeType: "boolean",
		defaultValue: true,
		name: "isVisible",
		optional: true,
		typeExpression: "boolean & tags.Default<true>",
	},
	{
		attributeType: "string",
		defaultValue: "click",
		enumValues: [...INTERACTIVE_MODE_VALUES],
		name: "interactiveMode",
		optional: true,
		typeExpression: '("click" | "hover") & tags.Default<"click">',
	},
	{
		attributeType: "string",
		defaultValue: "none",
		enumValues: [...ANIMATION_VALUES],
		name: "animation",
		optional: true,
		typeExpression:
			'("none" | "bounce" | "pulse" | "shake" | "flip") & tags.Default<"none">',
	},
	{
		attributeType: "number",
		constraints: {
			minimum: 0,
			typeTag: "uint32",
		},
		defaultValue: 0,
		name: "clickCount",
		optional: true,
		typeExpression: 'number & tags.Minimum<0> & tags.Type<"uint32"> & tags.Default<0>',
	},
	{
		attributeType: "boolean",
		defaultValue: false,
		name: "isAnimating",
		optional: true,
		typeExpression: "boolean & tags.Default<false>",
	},
	{
		attributeType: "boolean",
		defaultValue: true,
		name: "showCounter",
		optional: true,
		typeExpression: "boolean & tags.Default<true>",
	},
	{
		attributeType: "number",
		constraints: {
			minimum: 0,
			typeTag: "uint32",
		},
		defaultValue: 10,
		name: "maxClicks",
		optional: true,
		typeExpression: 'number & tags.Minimum<0> & tags.Type<"uint32"> & tags.Default<10>',
	},
] as const satisfies readonly BuiltInAttributeTemplateSpec<ScaffoldTemplateVariables>[];

const PERSISTENCE_ATTRIBUTE_SPECS = [
	{
		attributeType: "string",
		constraints: {
			maxLength: 250,
			minLength: 1,
		},
		defaultValue: (variables: ScaffoldTemplateVariables) =>
			`${variables.title} persistence block`,
		name: "content",
		optional: false,
		selector: (variables: ScaffoldTemplateVariables) =>
			`.${variables.cssClassName}__content`,
		source: "html",
		typeExpression: (variables: ScaffoldTemplateVariables) =>
			`string & tags.MinLength<1> & tags.MaxLength<250> & tags.Default<${JSON.stringify(`${variables.title} persistence block`)}>`,
	},
	{
		attributeType: "string",
		defaultValue: "left",
		enumValues: [...ALIGNMENT_VALUES],
		name: "alignment",
		optional: true,
		typeExpression: 'TextAlignment & tags.Default<"left">',
	},
	{
		attributeType: "boolean",
		defaultValue: true,
		name: "isVisible",
		optional: true,
		typeExpression: "boolean & tags.Default<true>",
	},
	{
		attributeType: "boolean",
		defaultValue: true,
		name: "showCount",
		optional: true,
		typeExpression: "boolean & tags.Default<true>",
	},
	{
		attributeType: "string",
		constraints: {
			maxLength: 40,
			minLength: 1,
		},
		defaultValue: "Persist Count",
		name: "buttonLabel",
		optional: true,
		typeExpression:
			'string & tags.MinLength<1> & tags.MaxLength<40> & tags.Default<"Persist Count">',
	},
	{
		attributeType: "string",
		blockJsonDefaultValue: "",
		constraints: {
			maxLength: 100,
			minLength: 1,
		},
		manifestDefaultValue: "primary",
		name: "resourceKey",
		optional: true,
		typeExpression:
			'string & tags.MinLength<1> & tags.MaxLength<100> & tags.Default<"primary">',
	},
] as const satisfies readonly BuiltInAttributeTemplateSpec<ScaffoldTemplateVariables>[];

const COMPOUND_PARENT_BASE_ATTRIBUTE_SPECS = [
	{
		attributeType: "string",
		constraints: {
			maxLength: 80,
			minLength: 1,
		},
		defaultValue: (variables: ScaffoldTemplateVariables) => variables.title,
		name: "heading",
		optional: false,
		selector: (variables: ScaffoldTemplateVariables) =>
			`.${variables.cssClassName}__heading`,
		source: "html",
		typeExpression: (variables: ScaffoldTemplateVariables) =>
			`string & tags.MinLength<1> & tags.MaxLength<80> & tags.Default<${JSON.stringify(variables.title)}>`,
	},
	{
		attributeType: "string",
		constraints: {
			maxLength: 180,
			minLength: 1,
		},
		defaultValue: "Add and reorder internal items inside this compound block.",
		name: "intro",
		optional: true,
		selector: (variables: ScaffoldTemplateVariables) =>
			`.${variables.cssClassName}__intro`,
		source: "html",
		typeExpression:
			'string & tags.MinLength<1> & tags.MaxLength<180> & tags.Default<"Add and reorder internal items inside this compound block.">',
	},
	{
		attributeType: "boolean",
		defaultValue: true,
		name: "showDividers",
		optional: true,
		typeExpression: "boolean & tags.Default<true>",
	},
] as const satisfies readonly BuiltInAttributeTemplateSpec<ScaffoldTemplateVariables>[];

const COMPOUND_PARENT_PERSISTENCE_ATTRIBUTE_SPECS = [
	{
		attributeType: "boolean",
		defaultValue: true,
		name: "showCount",
		optional: true,
		typeExpression: "boolean & tags.Default<true>",
	},
	{
		attributeType: "string",
		constraints: {
			maxLength: 40,
			minLength: 1,
		},
		defaultValue: "Persist Count",
		name: "buttonLabel",
		optional: true,
		typeExpression:
			'string & tags.MinLength<1> & tags.MaxLength<40> & tags.Default<"Persist Count">',
	},
	{
		attributeType: "string",
		blockJsonDefaultValue: "",
		constraints: {
			maxLength: 100,
			minLength: 1,
		},
		manifestDefaultValue: "primary",
		name: "resourceKey",
		optional: true,
		typeExpression:
			'string & tags.MinLength<1> & tags.MaxLength<100> & tags.Default<"primary">',
	},
] as const satisfies readonly BuiltInAttributeTemplateSpec<ScaffoldTemplateVariables>[];

const COMPOUND_CHILD_ATTRIBUTE_SPECS = [
	{
		attributeType: "string",
		constraints: {
			maxLength: 80,
			minLength: 1,
		},
		defaultValue: ({ childTitle }: CompoundChildAttributeVariables) => childTitle,
		name: "title",
		optional: false,
		selector: ({ childCssClassName }: CompoundChildAttributeVariables) =>
			childCssClassName ? `.${childCssClassName}__title` : null,
		source: ({ childCssClassName }: CompoundChildAttributeVariables) =>
			childCssClassName ? "html" : null,
		typeExpression: ({ childTitle }: CompoundChildAttributeVariables) =>
			`string & tags.MinLength<1> & tags.MaxLength<80> & tags.Default<${JSON.stringify(childTitle)}>`,
	},
	{
		attributeType: "string",
		constraints: {
			maxLength: 280,
			minLength: 1,
		},
		defaultValue: ({ bodyPlaceholder }: CompoundChildAttributeVariables) =>
			bodyPlaceholder,
		name: "body",
		optional: false,
		selector: ({ childCssClassName }: CompoundChildAttributeVariables) =>
			childCssClassName ? `.${childCssClassName}__body` : null,
		source: ({ childCssClassName }: CompoundChildAttributeVariables) =>
			childCssClassName ? "html" : null,
		typeExpression: ({ bodyPlaceholder }: CompoundChildAttributeVariables) =>
			`string & tags.MinLength<1> & tags.MaxLength<280> & tags.Default<${JSON.stringify(bodyPlaceholder)}>`,
	},
] as const satisfies readonly BuiltInAttributeTemplateSpec<CompoundChildAttributeVariables>[];

/**
 * Builds the emitted attribute set for the basic built-in block family.
 *
 * @returns Emitted attribute definitions for the basic template family.
 */
export function buildBasicAttributes(): EmittedAttributeDefinition[] {
	return buildAttributesFromSpecs(BASIC_ATTRIBUTE_SPECS, undefined);
}

/**
 * Builds the emitted attribute set for the interactivity built-in block family.
 *
 * @param variables Resolved scaffold template variables for the generated block.
 * @returns Emitted attribute definitions for the interactivity template family.
 */
export function buildInteractivityAttributes(
	variables: ScaffoldTemplateVariables,
): EmittedAttributeDefinition[] {
	return buildAttributesFromSpecs(INTERACTIVITY_ATTRIBUTE_SPECS, variables);
}

/**
 * Builds the emitted attribute set for the persistence built-in block family.
 *
 * @param variables Resolved scaffold template variables for the generated block.
 * @returns Emitted attribute definitions for the persistence template family.
 */
export function buildPersistenceAttributes(
	variables: ScaffoldTemplateVariables,
): EmittedAttributeDefinition[] {
	return buildAttributesFromSpecs(PERSISTENCE_ATTRIBUTE_SPECS, variables);
}

/**
 * Builds the emitted attribute set for the compound parent built-in block family.
 *
 * @param variables Resolved scaffold template variables for the generated block.
 * @returns Emitted attribute definitions for the compound parent artifact.
 */
export function buildCompoundParentAttributes(
	variables: ScaffoldTemplateVariables,
): EmittedAttributeDefinition[] {
	return buildAttributesFromSpecs(
		isCompoundPersistenceEnabled(variables)
			? [
				...COMPOUND_PARENT_BASE_ATTRIBUTE_SPECS,
				...COMPOUND_PARENT_PERSISTENCE_ATTRIBUTE_SPECS,
			]
			: COMPOUND_PARENT_BASE_ATTRIBUTE_SPECS,
		variables,
	);
}

/**
 * Builds the emitted attribute set for the compound child built-in block family.
 *
 * @param bodyPlaceholder Placeholder text for the child body field.
 * @param childTitle Default title used by the child block.
 * @param childCssClassName Optional CSS class used for HTML-backed selectors.
 * @returns Emitted attribute definitions for the compound child artifact.
 */
export function buildCompoundChildAttributes(
	childTitle: string,
	childCssClassName?: string | null,
	bodyPlaceholder = DEFAULT_COMPOUND_CHILD_BODY_PLACEHOLDER,
): EmittedAttributeDefinition[] {
	return buildAttributesFromSpecs(COMPOUND_CHILD_ATTRIBUTE_SPECS, {
		bodyPlaceholder,
		childCssClassName,
		childTitle,
	});
}
