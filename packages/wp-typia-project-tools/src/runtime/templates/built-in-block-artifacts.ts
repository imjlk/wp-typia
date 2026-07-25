import type { ManifestDocument } from '../migration/migration-types.js';
import type { ScaffoldTemplateVariables } from './scaffold.js';
import type { BuiltInTemplateId } from './template-registry.js';
import {
  buildBasicAttributes,
  buildBlockJsonAttributes,
  buildBlockJsonExampleAttributes,
  buildCompoundChildAttributes,
  buildCompoundParentAttributes,
  buildInteractivityAttributes,
  buildManifestDocument,
  buildPersistenceAttributes,
  DEFAULT_COMPOUND_CHILD_BODY_PLACEHOLDER,
} from './built-in-block-artifact-documents.js';
import {
  buildBasicTypesSource,
  buildCompoundChildTypesSource,
  buildCompoundTypesSource,
  buildInteractivityTypesSource,
  buildPersistenceTypesSource,
} from './built-in-block-artifact-types.js';
import { getScaffoldTemplateVariableGroups } from './scaffold-template-variable-groups.js';

export interface BuiltInBlockArtifact {
  blockJsonDocument: Record<string, unknown>;
  manifestDocument: ManifestDocument;
  relativeDir: string;
  typesSource: string;
}

function stringifyBlockJsonDocument(document: Record<string, unknown>): string {
  return JSON.stringify(document, null, '\t');
}

function buildBasicArtifact(
	variables: ScaffoldTemplateVariables,
): BuiltInBlockArtifact {
  const attributes = buildBasicAttributes();
  return {
    blockJsonDocument: {
      $schema: 'https://schemas.wp.org/trunk/block.json',
      apiVersion: 3,
      name: `${variables.namespace}/${variables.slug}`,
      version: variables.blockMetadataVersion,
      title: variables.title,
      category: variables.category,
      icon: variables.icon,
      description: variables.description,
      keywords: [variables.keyword, 'typia', 'block'],
      example: {
        attributes: buildBlockJsonExampleAttributes(attributes),
      },
      supports: {
        html: false,
      },
      textdomain: variables.textDomain,
      editorScript: 'file:./index.js',
      editorStyle: 'file:./index.css',
      style: 'file:./style-index.css',
      attributes: buildBlockJsonAttributes(attributes),
    },
    manifestDocument: buildManifestDocument(
      `${variables.pascalCase}Attributes`,
      attributes,
    ),
    relativeDir: 'src',
    typesSource: buildBasicTypesSource(variables, attributes),
  };
}

function buildInteractivityArtifact(
	variables: ScaffoldTemplateVariables,
): BuiltInBlockArtifact {
  const attributes = buildInteractivityAttributes(variables);
  return {
    blockJsonDocument: {
      $schema: 'https://schemas.wp.org/trunk/block.json',
      apiVersion: 3,
      name: `${variables.namespace}/${variables.slugKebabCase}`,
      version: variables.blockMetadataVersion,
      title: variables.title,
      category: variables.category,
      icon: variables.icon,
      description: variables.description,
      example: {
        attributes: buildBlockJsonExampleAttributes(attributes),
      },
      supports: {
        html: false,
        align: true,
        anchor: true,
        className: true,
        interactivity: true,
      },
      attributes: buildBlockJsonAttributes(attributes),
      textdomain: variables.textDomain,
      editorScript: 'file:./index.js',
      editorStyle: 'file:./index.css',
      style: 'file:./style-index.css',
      viewScriptModule: 'file:./interactivity.js',
    },
    manifestDocument: buildManifestDocument(
      `${variables.pascalCase}Attributes`,
      attributes,
    ),
    relativeDir: 'src',
    typesSource: buildInteractivityTypesSource(variables, attributes),
  };
}

function buildPersistenceArtifact(
	variables: ScaffoldTemplateVariables,
): BuiltInBlockArtifact {
  const attributes = buildPersistenceAttributes(variables);
  return {
    blockJsonDocument: {
      $schema: 'https://schemas.wp.org/trunk/block.json',
      apiVersion: 3,
      name: `${variables.namespace}/${variables.slugKebabCase}`,
      version: variables.blockMetadataVersion,
      title: variables.title,
      category: variables.category,
      icon: variables.icon,
      description: variables.description,
      example: {
        attributes: buildBlockJsonExampleAttributes(attributes),
      },
      supports: {
        html: false,
        align: true,
        anchor: true,
        className: true,
        interactivity: true,
      },
      attributes: buildBlockJsonAttributes(attributes),
      textdomain: variables.textDomain,
      editorScript: 'file:./index.js',
      style: 'file:./style-index.css',
      viewScriptModule: 'file:./interactivity.js',
      render: 'file:./render.php',
    },
    manifestDocument: buildManifestDocument(
      `${variables.pascalCase}Attributes`,
      attributes,
    ),
    relativeDir: 'src',
    typesSource: buildPersistenceTypesSource(variables, attributes),
  };
}

function buildCompoundParentArtifact(
	variables: ScaffoldTemplateVariables,
): BuiltInBlockArtifact {
  const attributes = buildCompoundParentAttributes(variables);
  const compoundGroup = getScaffoldTemplateVariableGroups(variables).compound;
  const persistenceEnabled =
		compoundGroup.enabled && compoundGroup.persistenceEnabled;

  return {
		blockJsonDocument: {
			$schema: 'https://schemas.wp.org/trunk/block.json',
			apiVersion: 3,
			name: `${variables.namespace}/${variables.slugKebabCase}`,
			version: variables.blockMetadataVersion,
			title: variables.title,
			category: variables.category,
			icon: variables.icon,
			description: variables.description,
			example: {
				attributes: buildBlockJsonExampleAttributes(attributes),
			},
			allowedBlocks: [`${variables.namespace}/${variables.slugKebabCase}-item`],
			supports: persistenceEnabled
				? {
					html: false,
					anchor: true,
					className: true,
					interactivity: true,
				}
				: {
					html: false,
					anchor: true,
					className: true,
				},
			attributes: buildBlockJsonAttributes(attributes),
			textdomain: variables.textDomain,
			editorScript: 'file:./index.js',
			style: 'file:./style-index.css',
			...(persistenceEnabled
				? {
					viewScriptModule: 'file:./interactivity.js',
					render: 'file:./render.php',
				}
				: {}),
		},
		manifestDocument: buildManifestDocument(`${variables.pascalCase}Attributes`, attributes),
		relativeDir: `src/blocks/${variables.slugKebabCase}`,
		typesSource: buildCompoundTypesSource(variables, attributes),
	};
}

function buildCompoundChildArtifact(
	variables: ScaffoldTemplateVariables,
	bodyPlaceholder = DEFAULT_COMPOUND_CHILD_BODY_PLACEHOLDER,
): BuiltInBlockArtifact {
  const attributes = buildCompoundChildAttributes(
    variables.compoundChildTitle,
    variables.compoundChildCssClassName,
    bodyPlaceholder,
  );
  return {
    blockJsonDocument: {
      $schema: 'https://schemas.wp.org/trunk/block.json',
      apiVersion: 3,
      name: `${variables.namespace}/${variables.slugKebabCase}-item`,
      version: variables.blockMetadataVersion,
      title: variables.compoundChildTitle,
      category: variables.compoundChildCategory,
      icon: variables.compoundChildIcon,
      description: `Internal item block used by ${variables.title}.`,
      parent: [`${variables.namespace}/${variables.slugKebabCase}`],
      example: {
        attributes: buildBlockJsonExampleAttributes(attributes),
      },
      supports: {
        html: false,
        inserter: false,
        reusable: false,
      },
      attributes: buildBlockJsonAttributes(attributes),
      textdomain: variables.textDomain,
      editorScript: 'file:./index.js',
    },
    manifestDocument: buildManifestDocument(
      `${variables.pascalCase}ItemAttributes`,
      attributes,
    ),
    relativeDir: `src/blocks/${variables.slugKebabCase}-item`,
    typesSource: buildCompoundChildTypesSource(variables, attributes),
  };
}

/**
 * Builds a starter manifest document for a generated compound child block.
 *
 * @param childTypeName TypeScript source type name for the child manifest.
 * @param childTitle Default title used by the child block.
 * @param bodyPlaceholder Optional placeholder used for the child body field.
 * @returns Starter manifest metadata for the compound child block.
 */
export function buildCompoundChildStarterManifestDocument(
	childTypeName: string,
	childTitle: string,
	bodyPlaceholder = DEFAULT_COMPOUND_CHILD_BODY_PLACEHOLDER,
): ManifestDocument {
  const attributes = buildCompoundChildAttributes(
    childTitle,
    null,
    bodyPlaceholder,
  );
  return buildManifestDocument(childTypeName, attributes);
}

/**
 * Generates typed structural artifacts for a built-in block scaffold.
 *
 * @param options.templateId Built-in template family to emit.
 * @param options.variables Resolved scaffold template variables.
 * @returns Structural artifacts for the built-in block, including compound
 * parent and child outputs when applicable.
 */
export function buildBuiltInBlockArtifacts({
	templateId,
	variables,
}: {
  templateId: BuiltInTemplateId;
  variables: ScaffoldTemplateVariables;
}): BuiltInBlockArtifact[] {
  if (templateId === 'basic') {
    return [buildBasicArtifact(variables)];
  }

  if (templateId === 'interactivity') {
    return [buildInteractivityArtifact(variables)];
  }

  if (templateId === 'persistence') {
    return [buildPersistenceArtifact(variables)];
  }

  if (templateId === 'compound') {
    return [
      buildCompoundParentArtifact(variables),
      buildCompoundChildArtifact(variables),
    ];
  }

  return [];
}

/**
 * Serializes a generated `block.json` document using scaffold formatting.
 *
 * @param document Structured `block.json` document.
 * @returns Pretty-printed JSON using tab indentation.
 */
export function stringifyBuiltInBlockJsonDocument(
	document: Record<string, unknown>,
): string {
  return stringifyBlockJsonDocument(document);
}
