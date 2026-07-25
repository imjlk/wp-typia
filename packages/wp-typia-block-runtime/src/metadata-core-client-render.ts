import * as path from 'node:path';

import type {
  ArtifactSyncExecutionOptions,
  SyncEndpointClientOptions,
  SyncEndpointClientResult,
} from './metadata-core.js';
import { reconcileGeneratedArtifacts } from './metadata-core-artifacts.js';
import {
  assertValidClientIdentifier,
  normalizeSyncEndpointClientOptions,
  reserveUniqueClientTypeIdentifier,
  resolveEndpointClientContract,
  toJavaScriptStringLiteral,
  toModuleImportPath,
  toValidatorAccessExpression,
} from './metadata-core-endpoint-client.js';
import { analyzeSourceTypes } from './metadata-parser.js';
import { normalizeEndpointAuthDefinition } from './schema-core.js';

const WORDPRESS_NAMED_CAPTURE_PREFIX = '(?P<';
const WORDPRESS_CAPTURE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

type EndpointPathTemplatePart =
	| {
			kind: 'literal';
			value: string;
	  }
	| {
			kind: 'optionalGroup';
			parts: EndpointPathTemplatePart[];
	  }
	| {
			kind: 'parameter';
			name: string;
			optional: boolean;
	  };

interface WordPressNamedCapture {
  end: number;
  name: string;
  start: number;
}

function findRegexGroupEnd(value: string, start: number): number | null {
  if (value[start] !== '(') {
    return null;
  }

  let depth = 0;
  let escaped = false;
  let inCharacterClass = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index] ?? '';
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '[' && !inCharacterClass) {
      inCharacterClass = true;
      continue;
    }
    if (char === ']' && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (inCharacterClass) {
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return null;
}

function parseWordPressNamedCaptureAt(
	endpointPath: string,
	start: number,
): WordPressNamedCapture | null {
  if (!endpointPath.startsWith(WORDPRESS_NAMED_CAPTURE_PREFIX, start)) {
    return null;
  }

  const nameStart = start + WORDPRESS_NAMED_CAPTURE_PREFIX.length;
  const nameEnd = endpointPath.indexOf('>', nameStart);
  if (nameEnd === -1) {
    return null;
  }

  const name = endpointPath.slice(nameStart, nameEnd);
  if (!WORDPRESS_CAPTURE_NAME_PATTERN.test(name)) {
    return null;
  }

  const end = findRegexGroupEnd(endpointPath, start);
  if (end === null || end <= nameEnd) {
    return null;
  }

  return {
    end,
    name,
    start,
  };
}

function pushEndpointPathLiteral(
	parts: EndpointPathTemplatePart[],
	value: string,
): void {
  const previous = parts[parts.length - 1];
  if (previous?.kind === 'literal') {
    previous.value += value;
    return;
  }

  parts.push({
    kind: 'literal',
    value,
  });
}

function parseEndpointPathTemplateParts(
	endpointPath: string,
	start = 0,
	end = endpointPath.length,
): EndpointPathTemplatePart[] {
  const parts: EndpointPathTemplatePart[] = [];
  let index = start;

  while (index < end) {
    if (endpointPath.startsWith('(?:', index)) {
      const groupEnd = findRegexGroupEnd(endpointPath, index);
      if (groupEnd !== null && groupEnd <= end && endpointPath[groupEnd] === '?') {
        parts.push({
          kind: 'optionalGroup',
          parts: parseEndpointPathTemplateParts(
            endpointPath,
            index + 3,
            groupEnd - 1,
          ),
        });
        index = groupEnd + 1;
        continue;
      }
    }

    const capture = parseWordPressNamedCaptureAt(endpointPath, index);
    if (capture && capture.end <= end) {
      const optional = endpointPath[capture.end] === '?';
      parts.push({
        kind: 'parameter',
        name: capture.name,
        optional,
      });
      index = capture.end + (optional ? 1 : 0);
      continue;
    }

    pushEndpointPathLiteral(parts, endpointPath[index] ?? '');
    index += 1;
  }

  return parts;
}

function escapeTemplateLiteralText(value: string): string {
  return value
		.replace(/\\/gu, '\\\\')
		.replace(/`/gu, '\\`')
		.replace(/\$\{/gu, '\\${');
}

function collectEndpointPathParameterNames(
	parts: readonly EndpointPathTemplatePart[],
	names: string[],
): string[] {
  for (const part of parts) {
    if (part.kind === 'optionalGroup') {
      collectEndpointPathParameterNames(part.parts, names);
      continue;
    }
    if (part.kind === 'parameter' && !names.includes(part.name)) {
      names.push(part.name);
    }
  }

  return names;
}

function getRequiredEndpointPathParameterNames(
	parts: readonly EndpointPathTemplatePart[],
): string[] {
  const names: string[] = [];

  for (const part of parts) {
    if (part.kind === 'optionalGroup') {
      continue;
    }
    if (part.kind === 'parameter' && !part.optional && !names.includes(
      part.name,
    )) {
      names.push(part.name);
    }
  }

  return names;
}

function collectEndpointPathBranchGuardParameterNames(
	parts: readonly EndpointPathTemplatePart[],
	names: string[],
): string[] {
  for (const part of parts) {
    if (part.kind === 'optionalGroup') {
      continue;
    }
    if (part.kind === 'parameter' && !part.optional && !names.includes(
      part.name,
    )) {
      names.push(part.name);
    }
  }

  return names;
}

function hasOptionalEndpointPathGroup(
	parts: readonly EndpointPathTemplatePart[],
): boolean {
  for (const part of parts) {
    if (part.kind === 'optionalGroup') {
      return true;
    }
  }

  return false;
}

function splitEndpointPathAlternativeParts(
	parts: readonly EndpointPathTemplatePart[],
): EndpointPathTemplatePart[][] {
  const alternatives: EndpointPathTemplatePart[][] = [[]];

  for (const part of parts) {
    if (part.kind !== 'literal' || !part.value.includes('|')) {
      alternatives[alternatives.length - 1]?.push(part);
      continue;
    }

    const literalAlternatives = part.value.split('|');
    for (const [index, literal] of literalAlternatives.entries()) {
      if (index > 0) {
        alternatives.push([]);
      }
      if (literal.length > 0) {
        pushEndpointPathLiteral(
          alternatives[alternatives.length - 1]!,
          literal,
        );
      }
    }
  }

  return alternatives;
}

function buildPathParameterPresentExpression(parameterIndex: number): string {
  return `pathParam${parameterIndex} !== undefined && pathParam${parameterIndex} !== null && pathParam${parameterIndex} !== ''`;
}

function buildPathParameterExpression(parameterIndex: number): string {
  return `encodeURIComponent( String( pathParam${parameterIndex} ) )`;
}

function buildEndpointPathTemplateBody(
	parts: readonly EndpointPathTemplatePart[],
	pathParameterNames: readonly string[],
): string {
  const parameterIndexes = new Map(
    pathParameterNames.map((name, index) => [name, index] as const),
  );
  const fragments: string[] = [];

  for (const part of parts) {
    if (part.kind === 'literal') {
      fragments.push(escapeTemplateLiteralText(part.value));
      continue;
    }
    if (part.kind === 'optionalGroup') {
      const alternativeGroups = splitEndpointPathAlternativeParts(part.parts);
      let literalFallbackTemplate: string | null = null;
      const alternativeFragments = alternativeGroups
				.map((alternativeParts) => {
					const alternativeParameterIndexes =
						collectEndpointPathBranchGuardParameterNames(alternativeParts, [])
						.map((name) => parameterIndexes.get(name))
						.filter((index): index is number => index !== undefined);
					if (alternativeParameterIndexes.length === 0) {
						if (
							alternativeGroups.length > 1 &&
							literalFallbackTemplate === null
						) {
							literalFallbackTemplate = buildEndpointPathTemplateBody(
								alternativeParts,
								pathParameterNames,
							);
						}
						return null;
					}

					return {
						condition: alternativeParameterIndexes
							.map((index) => buildPathParameterPresentExpression(index))
							.join(' && '),
						template: buildEndpointPathTemplateBody(
							alternativeParts,
							pathParameterNames,
						),
					};
				})
				.filter(
					(
						fragment,
					): fragment is {
						condition: string;
						template: string;
					} => fragment !== null,
				);
      if (alternativeFragments.length > 0) {
        fragments.push(
					`\${${alternativeFragments
						.map(
							(fragment) =>
								`${fragment.condition} ? \`${fragment.template}\` : `,
						)
						.join('')}${
						literalFallbackTemplate === null
							? "''"
							: `\`${literalFallbackTemplate}\``
					}}`,
				);
      }
      continue;
    }

    const parameterIndex = parameterIndexes.get(part.name);
    if (parameterIndex === undefined) {
      continue;
    }
    const parameterExpression = buildPathParameterExpression(parameterIndex);
    fragments.push(
			part.optional
				? `\${${buildPathParameterPresentExpression(
						parameterIndex,
					)} ? ${parameterExpression} : ''}`
				: `\${${parameterExpression}}`,
		);
  }

  return fragments.join('');
}

function buildEndpointPathTemplate(
	parts: readonly EndpointPathTemplatePart[],
	pathParameterNames: readonly string[],
): string {
  return `\`${buildEndpointPathTemplateBody(parts, pathParameterNames)}\``;
}

function buildEndpointPathRequestOptionLines(options: {
  endpointPath: string;
  requestLocationExpression: string | null;
}): string[] {
  const pathParts = parseEndpointPathTemplateParts(options.endpointPath);
  const pathParameterNames = collectEndpointPathParameterNames(pathParts, []);
  const hasPathParameters = pathParameterNames.length > 0;
  if (!hasPathParameters && !hasOptionalEndpointPathGroup(pathParts)) {
    return [];
  }
  const requiredPathParameterNames = getRequiredEndpointPathParameterNames(
    pathParts,
  );

  const pathParamSource =
		options.requestLocationExpression === "'query-and-body'"
      ? 'request.query'
      : 'request';
  return [
		`\tbuildRequestOptions: (${hasPathParameters ? 'request' : ''}) => {`,
		...(hasPathParameters
			? [
					`\t\tconst rawPathParams = ${pathParamSource} as unknown;`,
					`\t\tconst pathParams = rawPathParams && typeof rawPathParams === 'object'`,
					`\t\t\t? (rawPathParams as Record<string, unknown>)`,
					`\t\t\t: {};`,
					...pathParameterNames.map(
						(name, index) =>
							`\t\tconst pathParam${index} = pathParams[${toJavaScriptStringLiteral(name)}];`,
					),
				]
			: []),
		...requiredPathParameterNames.flatMap((name) => {
			const index = pathParameterNames.indexOf(name);
			return [
				`\t\tif (pathParam${index} === undefined || pathParam${index} === null || pathParam${index} === '') {`,
				`\t\t\tthrow new Error(${toJavaScriptStringLiteral(
					`Missing path parameter "${name}" for endpoint path "${options.endpointPath}".`,
				)});`,
				`\t\t}`,
			];
		}),
		`\t\treturn {`,
		`\t\t\tpath: ${buildEndpointPathTemplate(pathParts, pathParameterNames)},`,
		`\t\t};`,
		`\t},`,
	];
}

export async function syncEndpointClientModule(
	options: SyncEndpointClientOptions,
	executionOptions: ArtifactSyncExecutionOptions = {},
): Promise<SyncEndpointClientResult> {
  const { clientPath, manifest, projectRoot, typesFile, validatorsFile } =
		normalizeSyncEndpointClientOptions(options);
  analyzeSourceTypes({ projectRoot, typesFile }, [
    ...new Set(Object.values(manifest.contracts).map((contract) => contract.sourceTypeName)),
  ]);
  const operationIds = new Set<string>();
  const importedTypeNames = new Set<string>();
  const endpointLines: string[] = [];
  const inlineHelpers = new Set<string>();
  const validatorPropertyNames = new Map<string, string>();
  const hasCombinedRequestEndpoints = manifest.endpoints.some((endpoint) =>
    Boolean(endpoint.bodyContract && endpoint.queryContract),
  );
  const occupiedIdentifiers = new Set([
		'apiValidators',
		'callEndpoint',
		'createEndpoint',
		...(manifest.endpoints.some(
			(endpoint) => !endpoint.bodyContract && !endpoint.queryContract,
		)
			? ['validateNoRequest']
			: []),
		...(hasCombinedRequestEndpoints ? ['validateCombinedRequest'] : []),
	]);

  for (const endpoint of manifest.endpoints) {
    const normalizedAuth = normalizeEndpointAuthDefinition(endpoint);
    const endpointConstantName = `${endpoint.operationId}Endpoint`;
    assertValidClientIdentifier(endpoint.operationId, 'operationId');
    assertValidClientIdentifier(endpointConstantName, 'endpoint constant');
    if (operationIds.has(endpoint.operationId)) {
      throw new Error(
        `Duplicate endpoint operationId "${endpoint.operationId}" detected while generating the endpoint client.`,
      );
    }
    for (const identifier of [endpoint.operationId, endpointConstantName]) {
      if (occupiedIdentifiers.has(identifier)) {
        throw new Error(
          `Generated endpoint client identifier "${identifier}" collides with another emitted symbol.`,
        );
      }
    }
    operationIds.add(endpoint.operationId);
    occupiedIdentifiers.add(endpoint.operationId);
    occupiedIdentifiers.add(endpointConstantName);

    const queryContractKey = endpoint.queryContract ?? null;
    const bodyContractKey = endpoint.bodyContract ?? null;
    const endpointPathParameterNames = collectEndpointPathParameterNames(
      parseEndpointPathTemplateParts(endpoint.path),
      [],
    );
    if (
			!queryContractKey &&
			!bodyContractKey &&
			endpointPathParameterNames.length > 0
		) {
      throw new Error(
        `Endpoint "${endpoint.operationId}" path "${endpoint.path}" uses named path captures but does not define a query or body contract to carry those values.`,
      );
    }
    const hasRequest = Boolean(queryContractKey || bodyContractKey);
    const responseContract = resolveEndpointClientContract(
      manifest,
      endpoint.responseContract,
      endpoint.operationId,
      'responseContract',
    );
    importedTypeNames.add(responseContract.sourceTypeName);

    let requestTypeName = 'undefined';
    let requestValidatorExpression = 'validateNoRequest';
    let requestLocationExpression: string | null = null;
    const queryContract = queryContractKey
      ? resolveEndpointClientContract(
          manifest,
          queryContractKey,
          endpoint.operationId,
          'queryContract',
        )
      : null;
    const bodyContract = bodyContractKey
      ? resolveEndpointClientContract(
          manifest,
          bodyContractKey,
          endpoint.operationId,
          'bodyContract',
        )
      : null;

    if (queryContract && bodyContract) {
      const queryValidatorExpression = toValidatorAccessExpression(
        queryContractKey!,
        validatorPropertyNames,
      );
      const bodyValidatorExpression = toValidatorAccessExpression(
        bodyContractKey!,
        validatorPropertyNames,
      );
      requestTypeName = `{ query: ${queryContract.sourceTypeName}; body: ${bodyContract.sourceTypeName} }`;
      requestValidatorExpression = `(input) => validateCombinedRequest( input, ${queryValidatorExpression}, ${bodyValidatorExpression} )`;
      requestLocationExpression = "'query-and-body'";
      importedTypeNames.add(queryContract.sourceTypeName);
      importedTypeNames.add(bodyContract.sourceTypeName);
      inlineHelpers.add('validateCombinedRequest');
    } else if (queryContract) {
      requestTypeName = queryContract.sourceTypeName;
      requestValidatorExpression = toValidatorAccessExpression(
        queryContractKey!,
        validatorPropertyNames,
      );
      requestLocationExpression = "'query'";
      importedTypeNames.add(queryContract.sourceTypeName);
    } else if (bodyContract) {
      requestTypeName = bodyContract.sourceTypeName;
      requestValidatorExpression = toValidatorAccessExpression(
        bodyContractKey!,
        validatorPropertyNames,
      );
      requestLocationExpression = "'body'";
      importedTypeNames.add(bodyContract.sourceTypeName);
    } else {
      inlineHelpers.add('validateNoRequest');
    }

    const buildRequestOptionsLines = buildEndpointPathRequestOptionLines({
      endpointPath: endpoint.path,
      requestLocationExpression,
    });
    const returnCallExpression = hasRequest
      ? `callEndpoint( ${endpoint.operationId}Endpoint, request, options )`
      : `callEndpoint( ${endpoint.operationId}Endpoint, undefined, options )`;
    const returnCallLines =
			returnCallExpression.length <= 68
        ? [`\treturn ${returnCallExpression};`]
        : [
            `\treturn callEndpoint(`,
            `\t\t${endpoint.operationId}Endpoint,`,
            `\t\t${hasRequest ? 'request' : 'undefined'},`,
            `\t\toptions`,
            `\t);`,
          ];

    endpointLines.push(
			[
				`export const ${endpointConstantName} = createEndpoint<`,
				`\t${requestTypeName},`,
				`\t${responseContract.sourceTypeName}`,
				`>( {`,
				`\tauthIntent: ${toJavaScriptStringLiteral(normalizedAuth.auth)},`,
				...(normalizedAuth.authMode
					? [`\tauthMode: ${toJavaScriptStringLiteral(normalizedAuth.authMode)},`]
					: []),
				`\tmethod: ${toJavaScriptStringLiteral(endpoint.method)},`,
				`\toperationId: ${toJavaScriptStringLiteral(endpoint.operationId)},`,
				`\tpath: ${toJavaScriptStringLiteral(endpoint.path)},`,
				...(requestLocationExpression
					? [`\trequestLocation: ${requestLocationExpression},`]
					: []),
				...buildRequestOptionsLines,
				`\tvalidateRequest: ${requestValidatorExpression},`,
				`\tvalidateResponse: ${toValidatorAccessExpression(
					endpoint.responseContract,
					validatorPropertyNames,
				)},`,
				`} );`,
				'',
				`export function ${endpoint.operationId}(`,
				...(hasRequest ? [`\trequest: ${requestTypeName},`] : []),
				`\toptions: EndpointCallOptions`,
				`) {`,
				...returnCallLines,
				`}`,
			].join('\n'),
		);
  }

  const sortedTypeNames = [...importedTypeNames].sort();
  const helperTypeNames = new Set(sortedTypeNames);
  const combinedValidationErrorTypeName = inlineHelpers.has(
    'validateCombinedRequest',
  )
    ? reserveUniqueClientTypeIdentifier(
        'PortableValidationError',
        helperTypeNames,
      )
    : null;
  const combinedValidationResultTypeName = inlineHelpers.has(
    'validateCombinedRequest',
  )
    ? reserveUniqueClientTypeIdentifier(
        'PortableValidationResult',
        helperTypeNames,
      )
    : null;
  const lines = [
		`import {`,
		`\tcallEndpoint,`,
		`\tcreateEndpoint,`,
		`\ttype EndpointCallOptions,`,
		...(inlineHelpers.has('validateCombinedRequest')
			? [
					`\ttype ValidationError as ${combinedValidationErrorTypeName},`,
					`\ttype ValidationResult as ${combinedValidationResultTypeName},`,
				]
			: []),
		`} from '@wp-typia/api-client';`,
		...(sortedTypeNames.length === 1
			? [
					`import type { ${sortedTypeNames[0]} } from ${toJavaScriptStringLiteral(
						toModuleImportPath(clientPath, path.resolve(projectRoot, typesFile)),
					)};`,
				]
			: [
					`import type {`,
					...sortedTypeNames.map((typeName) => `\t${typeName},`),
					`} from ${toJavaScriptStringLiteral(
						toModuleImportPath(clientPath, path.resolve(projectRoot, typesFile)),
					)};`,
				]),
		`import { apiValidators } from ${toJavaScriptStringLiteral(
			toModuleImportPath(clientPath, path.resolve(projectRoot, validatorsFile)),
		)};`,
		'',
		...(inlineHelpers.has('validateNoRequest')
			? [
					`function validateNoRequest(input: unknown) {`,
					`\tif (input !== undefined) {`,
					`\t\treturn {`,
					`\t\t\tdata: undefined,`,
					`\t\t\terrors: [`,
					`\t\t\t\t{`,
					`\t\t\t\t\texpected: 'undefined',`,
					`\t\t\t\t\tpath: '(root)',`,
					`\t\t\t\t\tvalue: input,`,
					`\t\t\t\t},`,
					`\t\t\t],`,
					`\t\t\tisValid: false,`,
					`\t\t};`,
					`\t}`,
					'',
					`\treturn {`,
					`\t\tdata: undefined,`,
					`\t\terrors: [],`,
					`\t\tisValid: true,`,
					`\t};`,
					`}`,
					'',
				]
			: []),
		...(inlineHelpers.has('validateCombinedRequest')
			? [
					`function validateCombinedRequest<TQuery, TBody>(`,
					`\tinput: unknown,`,
					`\tvalidateQuery: (input: unknown) => ${combinedValidationResultTypeName}<TQuery>,`,
					`\tvalidateBody: (input: unknown) => ${combinedValidationResultTypeName}<TBody>,`,
					`): ${combinedValidationResultTypeName}<{ query: TQuery; body: TBody }> {`,
					`\tif ( input === null || typeof input !== 'object' || Array.isArray( input ) ) {`,
					`\t\treturn {`,
					`\t\t\tdata: undefined,`,
					`\t\t\terrors: [`,
					`\t\t\t\t{`,
					`\t\t\t\t\texpected: '{ query, body }',`,
					`\t\t\t\t\tpath: '(root)',`,
					`\t\t\t\t\tvalue: input,`,
					`\t\t\t\t},`,
					`\t\t\t],`,
					`\t\t\tisValid: false,`,
					`\t\t};`,
					`\t}`,
					``,
					`\tconst request = input as { query?: unknown; body?: unknown };`,
					`\tif ( !Object.prototype.hasOwnProperty.call( request, 'query' ) || !Object.prototype.hasOwnProperty.call( request, 'body' ) ) {`,
					`\t\treturn {`,
					`\t\t\tdata: undefined,`,
					`\t\t\terrors: [`,
					`\t\t\t\t{`,
					`\t\t\t\t\texpected: '{ query, body }',`,
					`\t\t\t\t\tpath: '(root)',`,
					`\t\t\t\t\tvalue: input,`,
					`\t\t\t\t},`,
					`\t\t\t],`,
					`\t\t\tisValid: false,`,
					`\t\t};`,
					`\t}`,
					``,
					`\tconst prefixPath = (prefix: '$.query' | '$.body', path: string): string => {`,
					`\t\tif ( path === '(root)' ) {`,
					`\t\t\treturn prefix;`,
					`\t\t}`,
					``,
					`\t\treturn path.startsWith( '$' ) ? \`\${prefix}\${path.slice( 1 )}\` : \`\${prefix}.\${path}\`;`,
					`\t};`,
					``,
					`\tconst queryValidation = validateQuery( request.query );`,
					`\tconst bodyValidation = validateBody( request.body );`,
					`\tconst errors: ${combinedValidationErrorTypeName}[] = [`,
					`\t\t...queryValidation.errors.map( ( error ) => ( {`,
					`\t\t\t...error,`,
					`\t\t\tpath: prefixPath( '$.query', error.path ),`,
					`\t\t} ) ),`,
					`\t\t...bodyValidation.errors.map( ( error ) => ( {`,
					`\t\t\t...error,`,
					`\t\t\tpath: prefixPath( '$.body', error.path ),`,
					`\t\t} ) ),`,
					`\t];`,
					``,
					`\tif ( !queryValidation.isValid || !bodyValidation.isValid ) {`,
					`\t\treturn {`,
					`\t\t\tdata: undefined,`,
					`\t\t\terrors,`,
					`\t\t\tisValid: false,`,
					`\t\t};`,
					`\t}`,
					``,
					`\treturn {`,
					`\t\tdata: {`,
					`\t\t\tbody: bodyValidation.data ?? ( request.body as TBody ),`,
					`\t\t\tquery: queryValidation.data ?? ( request.query as TQuery ),`,
					`\t\t},`,
					`\t\terrors: [],`,
					`\t\tisValid: true,`,
					`\t};`,
					`}`,
					'',
				]
			: []),
		...endpointLines.flatMap((entry) => [entry, '']),
	];

  reconcileGeneratedArtifacts(
    [
      {
        content: `${lines.join('\n').trimEnd()}\n`,
        path: clientPath,
      },
    ],
    executionOptions,
  );

  return {
    clientPath,
    endpointCount: manifest.endpoints.length,
    operationIds: [...operationIds],
  };
}
