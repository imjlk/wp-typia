import path from "node:path";

import {
	SHARED_WORKSPACE_TEMPLATE_ROOT,
} from "../templates/template-registry.js";
import type { MigrationBlockConfig } from "../migration/migration-types.js";
import type { ScaffoldTemplateVariables } from "../templates/scaffold.js";
import { isCompoundPersistenceEnabled } from "../templates/scaffold-template-variable-groups.js";
import {
	type AddBlockTemplateId,
	quoteTsString,
} from "./cli-add-shared.js";
import { buildPersistenceEndpointManifest } from "./persistence-rest-artifacts.js";

export function buildServerTemplateRoot(
	persistencePolicy: string | undefined,
): string {
	return path.join(
		SHARED_WORKSPACE_TEMPLATE_ROOT,
		persistencePolicy === "public" ? "persistence-public" : "persistence-auth",
	);
}

function buildSingleBlockConfigEntry(
	variables: ScaffoldTemplateVariables,
): string {
	return [
		"\t{",
		`\t\tslug: ${quoteTsString(variables.slugKebabCase)},`,
		`\t\tattributeTypeName: ${quoteTsString(`${variables.pascalCase}Attributes`)},`,
		`\t\ttypesFile: ${quoteTsString(`src/blocks/${variables.slugKebabCase}/types.ts`)},`,
		"\t},",
	].join("\n");
}

function buildPersistenceBlockConfigEntry(
	variables: ScaffoldTemplateVariables,
): string {
	const contractLines = Object.entries(
		buildPersistenceEndpointManifest(variables).contracts,
	).flatMap(([contractName, contract]) => [
		`\t\t\t\t${quoteTsString(contractName)}: {`,
		`\t\t\t\t\tsourceTypeName: ${quoteTsString(contract.sourceTypeName)},`,
		"\t\t\t\t},",
	]);

	return [
		"\t{",
		`\t\tapiTypesFile: ${quoteTsString(`src/blocks/${variables.slugKebabCase}/api-types.ts`)},`,
		`\t\tattributeTypeName: ${quoteTsString(`${variables.pascalCase}Attributes`)},`,
		"\t\trestManifest: defineEndpointManifest( {",
		"\t\t\tcontracts: {",
		...contractLines,
		"\t\t\t},",
		"\t\t\tendpoints: [",
		"\t\t\t\t{",
		"\t\t\t\t\tauth: 'public',",
		"\t\t\t\t\tmethod: 'GET',",
		`\t\t\t\t\toperationId: ${quoteTsString(`get${variables.pascalCase}State`)},`,
		`\t\t\t\t\tpath: ${quoteTsString(`/${variables.namespace}/v1/${variables.slugKebabCase}/state`)},`,
		"\t\t\t\t\tqueryContract: 'state-query',",
		"\t\t\t\t\tresponseContract: 'state-response',",
		`\t\t\t\t\tsummary: 'Read the current persisted state.',`,
		`\t\t\t\t\ttags: [ ${quoteTsString(variables.title)} ],`,
		"\t\t\t\t},",
		"\t\t\t\t{",
		`\t\t\t\t\tauth: ${quoteTsString(variables.restWriteAuthIntent)},`,
		"\t\t\t\t\tbodyContract: 'write-state-request',",
		"\t\t\t\t\tmethod: 'POST',",
		`\t\t\t\t\toperationId: ${quoteTsString(`write${variables.pascalCase}State`)},`,
		`\t\t\t\t\tpath: ${quoteTsString(`/${variables.namespace}/v1/${variables.slugKebabCase}/state`)},`,
		"\t\t\t\t\tresponseContract: 'state-response',",
		`\t\t\t\t\tsummary: 'Write the current persisted state.',`,
		`\t\t\t\t\ttags: [ ${quoteTsString(variables.title)} ],`,
		"\t\t\t\t\twordpressAuth: {",
		`\t\t\t\t\t\tmechanism: ${quoteTsString(variables.restWriteAuthMechanism)},`,
		"\t\t\t\t\t},",
		"\t\t\t\t},",
		"\t\t\t\t{",
		"\t\t\t\t\tauth: 'public',",
		"\t\t\t\t\tmethod: 'GET',",
		`\t\t\t\t\toperationId: ${quoteTsString(`get${variables.pascalCase}Bootstrap`)},`,
		`\t\t\t\t\tpath: ${quoteTsString(`/${variables.namespace}/v1/${variables.slugKebabCase}/bootstrap`)},`,
		"\t\t\t\t\tqueryContract: 'bootstrap-query',",
		"\t\t\t\t\tresponseContract: 'bootstrap-response',",
		`\t\t\t\t\tsummary: 'Read fresh session bootstrap state for the current viewer.',`,
		`\t\t\t\t\ttags: [ ${quoteTsString(variables.title)} ],`,
		"\t\t\t\t},",
		"\t\t\t],",
		"\t\t\tinfo: {",
		`\t\t\t\ttitle: ${quoteTsString(`${variables.title} REST API`)},`,
		"\t\t\t\tversion: '1.0.0',",
		"\t\t\t},",
		"\t\t} ),",
		`\t\topenApiFile: ${quoteTsString(`src/blocks/${variables.slugKebabCase}/api.openapi.json`)},`,
		`\t\tslug: ${quoteTsString(variables.slugKebabCase)},`,
		`\t\ttypesFile: ${quoteTsString(`src/blocks/${variables.slugKebabCase}/types.ts`)},`,
		"\t},",
	].join("\n");
}

function buildCompoundChildConfigEntry(
	variables: ScaffoldTemplateVariables,
): string {
	return [
		"\t{",
		`\t\tslug: ${quoteTsString(`${variables.slugKebabCase}-item`)},`,
		`\t\tattributeTypeName: ${quoteTsString(`${variables.pascalCase}ItemAttributes`)},`,
		`\t\ttypesFile: ${quoteTsString(`src/blocks/${variables.slugKebabCase}-item/types.ts`)},`,
		"\t},",
	].join("\n");
}

export function buildConfigEntries(
	templateId: AddBlockTemplateId,
	variables: ScaffoldTemplateVariables,
): string[] {
	if (templateId === "basic" || templateId === "interactivity") {
		return [buildSingleBlockConfigEntry(variables)];
	}

	if (templateId === "persistence") {
		return [buildPersistenceBlockConfigEntry(variables)];
	}

	if (isCompoundPersistenceEnabled(variables)) {
		return [
			buildPersistenceBlockConfigEntry(variables),
			buildCompoundChildConfigEntry(variables),
		];
	}

	return [
		buildSingleBlockConfigEntry(variables),
		buildCompoundChildConfigEntry(variables),
	];
}

export function buildMigrationBlocks(
	templateId: AddBlockTemplateId,
	variables: ScaffoldTemplateVariables,
): MigrationBlockConfig[] {
	if (templateId === "compound") {
		return [
			{
				blockJsonFile: `src/blocks/${variables.slugKebabCase}/block.json`,
				blockName: `${variables.namespace}/${variables.slugKebabCase}`,
				key: variables.slugKebabCase,
				manifestFile: `src/blocks/${variables.slugKebabCase}/typia.manifest.json`,
				saveFile: `src/blocks/${variables.slugKebabCase}/save.tsx`,
				typesFile: `src/blocks/${variables.slugKebabCase}/types.ts`,
			},
			{
				blockJsonFile: `src/blocks/${variables.slugKebabCase}-item/block.json`,
				blockName: `${variables.namespace}/${variables.slugKebabCase}-item`,
				key: `${variables.slugKebabCase}-item`,
				manifestFile: `src/blocks/${variables.slugKebabCase}-item/typia.manifest.json`,
				saveFile: `src/blocks/${variables.slugKebabCase}-item/save.tsx`,
				typesFile: `src/blocks/${variables.slugKebabCase}-item/types.ts`,
			},
		];
	}

	return [
		{
			blockJsonFile: `src/blocks/${variables.slugKebabCase}/block.json`,
			blockName: `${variables.namespace}/${variables.slugKebabCase}`,
			key: variables.slugKebabCase,
			manifestFile: `src/blocks/${variables.slugKebabCase}/typia.manifest.json`,
			saveFile: `src/blocks/${variables.slugKebabCase}/save.tsx`,
			typesFile: `src/blocks/${variables.slugKebabCase}/types.ts`,
		},
	];
}
