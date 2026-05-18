import type { ScaffoldPluginHeaderCompatibility } from "./scaffold-compatibility.js";

export const SCAFFOLD_TEMPLATE_VARIABLE_GROUPS = Symbol(
	"wp-typia.scaffold-template-variable-groups",
);

export type ScaffoldTemplateFamily =
	| "basic"
	| "interactivity"
	| "persistence"
	| "compound"
	| "query-loop"
	| "external";

export interface ScaffoldSharedTemplateVariableGroup {
	author: string;
	blockMetadataVersion: string;
	category: string;
	compatibility: ScaffoldPluginHeaderCompatibility;
	cssClassName: string;
	description: string;
	descriptionJson: string;
	frontendCssClassName: string;
	icon: string;
	keyword: string;
	namespace: string;
	pascalCase: string;
	phpPrefix: string;
	phpPrefixUpper: string;
	slug: string;
	slugCamelCase: string;
	slugKebabCase: string;
	slugSnakeCase: string;
	textDomain: string;
	title: string;
	titleCase: string;
	titleJson: string;
	versions: {
		apiClient: string;
		blockRuntime: string;
		blockTypes: string;
		projectTools: string;
		rest: string;
	};
}

export interface ScaffoldAlternateRenderTargetVariableGroup {
	csv: string;
	enabled: boolean;
	hasEmail: boolean;
	hasMjml: boolean;
	hasPlainText: boolean;
	json: string;
	targets: readonly string[];
}

export interface DisabledScaffoldCompoundVariableGroup {
	enabled: false;
	persistenceEnabled: false;
}

export interface EnabledScaffoldCompoundVariableGroup {
	child: {
		category: string;
		cssClassName: string;
		icon: string;
		title: string;
		titleJson: string;
	};
	enabled: true;
	innerBlocks: {
		description: string;
		directInsert: boolean;
		label: string;
		orientation: "" | "horizontal" | "vertical";
		orientationExpression: string;
		preset: string;
		templateLockExpression: string;
	};
	persistenceEnabled: boolean;
}

export type ScaffoldCompoundVariableGroup =
	| DisabledScaffoldCompoundVariableGroup
	| EnabledScaffoldCompoundVariableGroup;

export interface DisabledScaffoldPersistenceVariableGroup {
	enabled: false;
	scope: "none";
}

export interface EnabledScaffoldPersistenceVariableGroup {
	auth: {
		bootstrapCredentialDeclarations: string;
		descriptionJson: string;
		intent: "authenticated" | "public-write-protected";
		isAuthenticated: boolean;
		isPublic: boolean;
		mechanism: "public-signed-token" | "rest-nonce";
		mode: "authenticated-rest-nonce" | "public-signed-token";
		publicWriteRequestIdDeclaration: string;
	};
	dataStorageMode: "custom-table" | "post-meta";
	enabled: true;
	policy: "authenticated" | "public";
	scope: "compound-parent" | "single";
}

export type ScaffoldPersistenceVariableGroup =
	| DisabledScaffoldPersistenceVariableGroup
	| EnabledScaffoldPersistenceVariableGroup;

export interface DisabledScaffoldQueryLoopVariableGroup {
	enabled: false;
}

export interface EnabledScaffoldQueryLoopVariableGroup {
	allowedControls: readonly string[];
	allowedControlsJson: string;
	enabled: true;
	postType: string;
	postTypeJson: string;
	variationNamespace: string;
	variationNamespaceJson: string;
}

export type ScaffoldQueryLoopVariableGroup =
	| DisabledScaffoldQueryLoopVariableGroup
	| EnabledScaffoldQueryLoopVariableGroup;

interface ScaffoldTemplateVariableGroupsBase {
	alternateRenderTargets: ScaffoldAlternateRenderTargetVariableGroup;
	shared: ScaffoldSharedTemplateVariableGroup;
	template: {
		description: string;
	};
}

type DisabledTemplateFamilyGroups<
	TFamily extends "basic" | "interactivity" | "external",
> = ScaffoldTemplateVariableGroupsBase & {
	compound: DisabledScaffoldCompoundVariableGroup;
	persistence: DisabledScaffoldPersistenceVariableGroup;
	queryLoop: DisabledScaffoldQueryLoopVariableGroup;
	templateFamily: TFamily;
};

export type BasicScaffoldTemplateVariableGroups =
	DisabledTemplateFamilyGroups<"basic">;

export type InteractivityScaffoldTemplateVariableGroups =
	DisabledTemplateFamilyGroups<"interactivity">;

export interface PersistenceScaffoldTemplateVariableGroups
	extends ScaffoldTemplateVariableGroupsBase {
	compound: DisabledScaffoldCompoundVariableGroup;
	persistence: EnabledScaffoldPersistenceVariableGroup & {
		scope: "single";
	};
	queryLoop: DisabledScaffoldQueryLoopVariableGroup;
	templateFamily: "persistence";
}

export interface CompoundScaffoldTemplateVariableGroups
	extends ScaffoldTemplateVariableGroupsBase {
	compound: EnabledScaffoldCompoundVariableGroup;
	persistence:
		| DisabledScaffoldPersistenceVariableGroup
		| (EnabledScaffoldPersistenceVariableGroup & {
				scope: "compound-parent";
		  });
	queryLoop: DisabledScaffoldQueryLoopVariableGroup;
	templateFamily: "compound";
}

export interface QueryLoopScaffoldTemplateVariableGroups
	extends ScaffoldTemplateVariableGroupsBase {
	compound: DisabledScaffoldCompoundVariableGroup;
	persistence: DisabledScaffoldPersistenceVariableGroup;
	queryLoop: EnabledScaffoldQueryLoopVariableGroup;
	templateFamily: "query-loop";
}

export type ExternalScaffoldTemplateVariableGroups =
	DisabledTemplateFamilyGroups<"external">;

export type ScaffoldTemplateVariableGroups =
	| BasicScaffoldTemplateVariableGroups
	| InteractivityScaffoldTemplateVariableGroups
	| PersistenceScaffoldTemplateVariableGroups
	| CompoundScaffoldTemplateVariableGroups
	| QueryLoopScaffoldTemplateVariableGroups
	| ExternalScaffoldTemplateVariableGroups;

export interface ScaffoldTemplateVariableGroupsCarrier {
	readonly [SCAFFOLD_TEMPLATE_VARIABLE_GROUPS]: ScaffoldTemplateVariableGroups;
}

export type CompoundScaffoldTemplateVariablesLike =
	ScaffoldTemplateVariableGroupsCarrier & {
		slugKebabCase: string;
	};

export type PersistenceScaffoldTemplateVariablesLike =
	ScaffoldTemplateVariableGroupsCarrier & {
		namespace: string;
		pascalCase: string;
		slugKebabCase: string;
		title: string;
	};

export function attachScaffoldTemplateVariableGroups<
	TVariables extends Record<string, string>,
>(
	variables: TVariables,
	groups: ScaffoldTemplateVariableGroups,
): TVariables & ScaffoldTemplateVariableGroupsCarrier {
	Object.defineProperty(variables, SCAFFOLD_TEMPLATE_VARIABLE_GROUPS, {
		configurable: false,
		enumerable: false,
		value: groups,
		writable: false,
	});

	return variables as TVariables & ScaffoldTemplateVariableGroupsCarrier;
}

export function getScaffoldTemplateVariableGroups(
	variables: ScaffoldTemplateVariableGroupsCarrier,
): ScaffoldTemplateVariableGroups {
	return variables[SCAFFOLD_TEMPLATE_VARIABLE_GROUPS];
}

export function isCompoundPersistenceEnabled(
	variables: ScaffoldTemplateVariableGroupsCarrier,
): boolean {
	const compound = getScaffoldTemplateVariableGroups(variables).compound;
	return compound.enabled && compound.persistenceEnabled;
}

export function getScaffoldAlternateRenderTargets(
	variables: ScaffoldTemplateVariableGroupsCarrier,
): ScaffoldAlternateRenderTargetVariableGroup {
	return getScaffoldTemplateVariableGroups(variables).alternateRenderTargets;
}
