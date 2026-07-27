#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const allowedCategories = new Set([
  'Transport',
  'REST',
  'Validation',
  'React',
  'Schema',
  'Migration',
  'Scaffolding',
  'Workspace',
  'Utilities',
  'Types',
]);

const coreTargets = [
  {
    file: 'wp-typia-api-client/src/client.ts',
    name: 'ApiEndpoint',
  },
  {
    file: 'wp-typia-api-client/src/client.ts',
    name: 'EndpointTransport',
  },
  {
    file: 'wp-typia-api-client/src/client.ts',
    name: 'EndpointCallOptions',
  },
  {
    file: 'wp-typia-api-client/src/client.ts',
    name: 'createFetchTransport',
    requiresExample: true,
  },
  {
    file: 'wp-typia-api-client/src/client.ts',
    name: 'withHeaders',
  },
  {
    file: 'wp-typia-api-client/src/client.ts',
    name: 'withComputedHeaders',
  },
  {
    file: 'wp-typia-api-client/src/client.ts',
    name: 'withHeaderValue',
  },
  {
    file: 'wp-typia-api-client/src/client.ts',
    name: 'withBearerToken',
  },
  {
    file: 'wp-typia-api-client/src/client.ts',
    name: 'createEndpoint',
    requiresExample: true,
  },
  {
    file: 'wp-typia-api-client/src/client.ts',
    name: 'callEndpoint',
    requiresExample: true,
  },
  {
    file: 'wp-typia-rest/src/client.ts',
    name: 'ValidatedFetch',
  },
  {
    file: 'wp-typia-rest/src/client.ts',
    name: 'ApiEndpoint',
  },
  {
    file: 'wp-typia-rest/src/client.ts',
    name: 'EndpointCallOptions',
  },
  {
    file: 'wp-typia-rest/src/client.ts',
    name: 'resolveRestRouteUrl',
    requiresExample: true,
  },
  {
    file: 'wp-typia-rest/src/client.ts',
    name: 'createValidatedFetch',
    requiresExample: true,
  },
  {
    file: 'wp-typia-rest/src/client.ts',
    name: 'createEndpoint',
  },
  {
    file: 'wp-typia-rest/src/client.ts',
    name: 'callEndpoint',
    requiresExample: true,
  },
  {
    file: 'wp-typia-rest/src/http.ts',
    name: 'createQueryDecoder',
    requiresExample: true,
  },
  {
    file: 'wp-typia-rest/src/http.ts',
    name: 'createHeadersDecoder',
    requiresExample: true,
  },
  {
    file: 'wp-typia-rest/src/http.ts',
    name: 'createParameterDecoder',
    requiresExample: true,
  },
  {
    file: 'wp-typia-rest/src/react.ts',
    name: 'EndpointDataClient',
  },
  {
    file: 'wp-typia-rest/src/react.ts',
    name: 'UseEndpointQueryOptions',
  },
  {
    file: 'wp-typia-rest/src/react.ts',
    name: 'UseEndpointQueryResult',
  },
  {
    file: 'wp-typia-rest/src/react.ts',
    name: 'UseEndpointMutationOptions',
  },
  {
    file: 'wp-typia-rest/src/react.ts',
    name: 'UseEndpointMutationResult',
  },
  {
    file: 'wp-typia-rest/src/react.ts',
    name: 'createEndpointDataClient',
    requiresExample: true,
  },
  {
    file: 'wp-typia-rest/src/react.ts',
    name: 'EndpointDataProvider',
  },
  {
    file: 'wp-typia-rest/src/react.ts',
    name: 'useEndpointDataClient',
  },
  {
    file: 'wp-typia-rest/src/react.ts',
    name: 'useEndpointQuery',
    requiresExample: true,
  },
  {
    file: 'wp-typia-rest/src/react.ts',
    name: 'useEndpointMutation',
    requiresExample: true,
  },
  {
    file: 'wp-typia-block-runtime/src/validation.ts',
    name: 'createScaffoldValidatorToolkit',
    requiresExample: true,
  },
  {
    file: 'wp-typia-block-runtime/src/validation.ts',
    name: 'createUseTypiaValidationHook',
    requiresExample: true,
  },
  {
    file: 'wp-typia-block-runtime/src/validation.ts',
    name: 'createAttributeUpdater',
    requiresExample: true,
  },
  {
    file: 'wp-typia-block-runtime/src/validation.ts',
    name: 'createNestedAttributeUpdater',
    requiresExample: true,
  },
  {
    file: 'wp-typia-block-runtime/src/editor.ts',
    name: 'createEditorModel',
    requiresExample: true,
  },
  {
    file: 'wp-typia-block-runtime/src/editor.ts',
    name: 'describeEditorField',
    requiresExample: true,
  },
  {
    file: 'wp-typia-block-runtime/src/defaults.ts',
    name: 'applyTemplateDefaultsFromManifest',
    requiresExample: true,
  },
  {
    file: 'wp-typia-block-runtime/src/blocks.ts',
    name: 'buildScaffoldBlockRegistration',
    requiresExample: true,
  },
  {
    file: 'wp-typia-block-runtime/src/blocks.ts',
    name: 'createTypiaWebpackConfig',
    requiresExample: true,
  },
];

const advancedSourceFiles = new Set([
  'wp-typia-api-client/src/internal/runtime-primitives.ts',
  'wp-typia-block-runtime/src/identifiers.ts',
  'wp-typia-block-runtime/src/inspector-runtime-controls.tsx',
  'wp-typia-block-runtime/src/inspector-runtime-model.tsx',
  'wp-typia-block-runtime/src/inspector-runtime-types.ts',
  'wp-typia-block-runtime/src/json-utils.ts',
  'wp-typia-block-runtime/src/metadata-analysis.ts',
  'wp-typia-block-runtime/src/metadata-model.ts',
  'wp-typia-block-runtime/src/metadata-parser.ts',
  'wp-typia-block-runtime/src/metadata-php-render.ts',
  'wp-typia-block-runtime/src/metadata-projection.ts',
]);

const topLevelKinds = new Set([32, 64, 256, 2097152]);

const moduleKinds = new Set([1, 2]);

function stringifyCommentParts(parts = []) {
  return parts
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

function commentHasTag(comment, tagName) {
  return (comment?.blockTags ?? []).some((tag) => tag.tag === tagName);
}

function readCategory(comment) {
  const blockTag = (comment?.blockTags ?? []).find(
    (tag) => tag.tag === '@category',
  );
  return stringifyCommentParts(blockTag?.content);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getLabel(target) {
  return `${target.file}:${target.name}`;
}

function findReflectionById(model, reflectionId) {
  let match = null;

  function walk(node) {
    if (!node || typeof node !== 'object' || match) {
      return;
    }
    if (node.id === reflectionId) {
      match = node;
      return;
    }

    for (const key of ['children', 'signatures']) {
      for (const child of node[key] ?? []) {
        walk(child);
      }
    }
  }

  walk(model);
  return match;
}

function findTargetReflection(model, target) {
  let match = null;

  function walk(node, ancestors = []) {
    if (!node || typeof node !== 'object' || match) {
      return;
    }

    const belongsToTargetModule = ancestors.some(
      (ancestor) =>
        moduleKinds.has(ancestor.kind) &&
        ancestor.sources?.some((source) => source.fileName === target.file),
    );
    const isCanonical =
      node.name === target.name &&
      (belongsToTargetModule ||
        node.sources?.some((source) => source.fileName === target.file)) &&
      ancestors.at(-1)?.name !== node.name;

    if (isCanonical) {
      match = node;
      return;
    }

    for (const key of ['children', 'signatures']) {
      for (const child of node[key] ?? []) {
        walk(child, [...ancestors, node]);
      }
    }
  }

  walk(model);
  return typeof match?.target === 'number'
    ? findReflectionById(model, match.target)
    : match;
}

function validateSummaryAndCategory(comment, label, errors) {
  if (!comment || !stringifyCommentParts(comment.summary)) {
    errors.push(`${label} is missing a summary comment.`);
    return false;
  }

  const category = readCategory(comment);
  if (!category) {
    errors.push(`${label} is missing an @category tag.`);
  } else if (!allowedCategories.has(category)) {
    errors.push(
      `${label} uses unsupported @category ${JSON.stringify(category)}.`,
    );
  }

  return true;
}

function validateCallableCommentCoverage(
  commentHolder,
  comment,
  label,
  errors,
) {
  const parameters = commentHolder.parameters ?? [];
  for (const parameter of parameters) {
    if (!stringifyCommentParts(parameter.comment?.summary)) {
      errors.push(
        `${label} is missing a @param description for ${parameter.name}.`,
      );
    }
  }

  if (!commentHasTag(comment, '@returns')) {
    errors.push(`${label} is missing an @returns tag.`);
  }
}

function validateCoreTarget(reflection, target, errors) {
  const commentHolder = reflection.signatures?.[0] ?? reflection;
  const comment = commentHolder.comment;
  const label = getLabel(target);

  if (!validateSummaryAndCategory(comment, label, errors)) {
    return;
  }

  if (reflection.signatures?.length) {
    validateCallableCommentCoverage(commentHolder, comment, label, errors);
  }

  if (target.requiresExample && !commentHasTag(comment, '@example')) {
    errors.push(`${label} is missing an @example tag.`);
  }
}

function collectAdvancedTargets(model) {
  const targets = new Map();

  function walk(node, parent = null) {
    if (!node || typeof node !== 'object') {
      return;
    }

    const sourceFile = node.sources?.[0]?.fileName;
    if (
      sourceFile &&
      advancedSourceFiles.has(sourceFile) &&
      topLevelKinds.has(node.kind) &&
      moduleKinds.has(parent?.kind ?? 1)
    ) {
      const key = `${sourceFile}:${node.name}:${node.kind}`;
      targets.set(key, {
        file: sourceFile,
        name: node.name,
        reflection: node,
      });
    }

    for (const child of node.children ?? []) {
      walk(child, node);
    }
  }

  walk(model);
  return [...targets.values()].sort((left, right) => {
    return getLabel(left).localeCompare(getLabel(right));
  });
}

function validateAdvancedTarget(reflection, label, errors) {
  const commentHolder = reflection.signatures?.[0] ?? reflection;
  const comment = commentHolder.comment;

  if (!validateSummaryAndCategory(comment, label, errors)) {
    return;
  }

  if (reflection.signatures?.length) {
    validateCallableCommentCoverage(commentHolder, comment, label, errors);
  }
}

function main() {
  const jsonPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve('.cache/typedoc/public-api.json');
  const model = readJson(jsonPath);
  const errors = [];

  for (const target of coreTargets) {
    const reflection = findTargetReflection(model, target);
    if (!reflection) {
      errors.push(
        `${getLabel(target)} was not found in the public TypeDoc model.`,
      );
      continue;
    }

    validateCoreTarget(reflection, target, errors);
  }

  const advancedTargets = collectAdvancedTargets(model);
  if (advancedTargets.length === 0) {
    errors.push(
      'No advanced/internal TypeDoc reflections were found for the selective audit tier.',
    );
  }

  for (const target of advancedTargets) {
    validateAdvancedTarget(
      target.reflection,
      `${target.file}:${target.name}`,
      errors,
    );
  }

  if (errors.length > 0) {
    console.error('Public docs audit failed:\n');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `Public docs audit passed for ${coreTargets.length} core symbols and ${advancedTargets.length} advanced/internal exports in ${path.relative(process.cwd(), jsonPath)}.`,
  );
}

main();
