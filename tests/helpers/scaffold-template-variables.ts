import type {
  FlatScaffoldTemplateVariables,
  ScaffoldTemplateFamily,
  ScaffoldTemplateVariables,
} from '../../packages/wp-typia-project-tools/src/runtime/scaffold';
import { attachScaffoldTemplateVariableGroups } from '../../packages/wp-typia-project-tools/src/runtime/scaffold-template-variable-groups';

export function createTestScaffoldTemplateVariables(
	overrides: Partial<FlatScaffoldTemplateVariables> & {
		templateFamily?: ScaffoldTemplateFamily;
	} = {},
): ScaffoldTemplateVariables {
  const {
		templateFamily,
		...flatOverrides
	} = overrides;
  const base: FlatScaffoldTemplateVariables = {
		alternateRenderTargetsCsv: '',
		alternateRenderTargetsJson: '[]',
		apiClientPackageVersion: '^0.2.0',
		author: 'Test Author',
		bootstrapEndpointDeclaration:
			'export const bootstrapEndpoint = createRestEndpoint(\n  getDemoBlockBootstrapEndpoint,\n);',
		blockMetadataVersion: '0.1.0',
		blockRuntimePackageVersion: '^0.3.0',
		blockTypesPackageVersion: '^0.2.0',
		category: 'widgets',
		compoundChildCategory: 'widgets',
		compoundChildCssClassName: 'wp-block-demo-demo-block-item',
			compoundChildIcon: 'excerpt-view',
			compoundChildTitle: 'Demo Item',
			compoundChildTitleJson: JSON.stringify('Demo Item'),
			compoundChildTitleTsLiteral: "'Demo Item'",
			compoundPersistenceEnabled: 'false',
			compoundInnerBlocksDirectInsert: 'false',
			compoundInnerBlocksOrientation: 'vertical',
			compoundInnerBlocksOrientationExpression: "'vertical'",
			compoundInnerBlocksPreset: 'freeform',
			compoundInnerBlocksPresetDescription:
				'Unlocked nested authoring with the default inserter and starter child template.',
			compoundInnerBlocksPresetLabel: 'freeform',
			compoundInnerBlocksTemplateLockExpression: 'false',
			hasAlternateEmailRenderTarget: 'false',
		hasAlternateMjmlRenderTarget: 'false',
		hasAlternatePlainTextRenderTarget: 'false',
		hasAlternateRenderTargets: 'false',
		projectToolsPackageVersion: '^0.8.0',
		wpTypiaPackageVersion: '^0.8.0',
		cssClassName: 'wp-block-demo-demo-block',
		dashCase: 'demo-block',
		dataStorageMode: 'custom-table',
		description: 'Demo description',
		descriptionJson: JSON.stringify('Demo description'),
		descriptionTsLiteral: "'Demo description'",
		frontendCssClassName: 'wp-block-demo-demo-block-frontend',
		icon: 'smiley',
		isAuthenticatedPersistencePolicy: 'true',
		isPublicPersistencePolicy: 'false',
		bootstrapCredentialDeclarations:
			'restNonce?: string & tags.MinLength< 1 > & tags.MaxLength< 128 >;',
		persistencePolicyDescriptionJson: JSON.stringify(
			'Writes require a logged-in user and a valid REST nonce.',
		),
		persistencePolicyDescriptionTsLiteral:
			"'Writes require a logged-in user and a valid REST nonce.'",
		keyword: 'demo',
		namespace: 'demo',
		needsMigration: 'false',
		pascalCase: 'DemoBlock',
		persistencePolicy: 'authenticated',
		phpPrefix: 'demo_block',
		phpPrefixUpper: 'DEMO_BLOCK',
		queryAllowedControlsJson: JSON.stringify([]),
		queryAllowedControlsTsLiteral: '[]',
		queryPostType: 'post',
			queryPostTypeJson: JSON.stringify('post'),
			queryPostTypeTsLiteral: "'post'",
			queryVariationNamespace: 'demo/demo-block',
			queryVariationNamespaceJson: JSON.stringify('demo/demo-block'),
			queryVariationNamespaceTsLiteral: "'demo/demo-block'",
			publicWriteRequestIdDeclaration: 'publicWriteRequestId?: string;',
			requiresAtLeast: '6.7',
			requiresPhp: '8.0',
			restPackageVersion: '^0.2.0',
		restWriteAuthIntent: 'authenticated',
		restWriteAuthMechanism: 'rest-nonce',
		restWriteAuthMode: 'authenticated-rest-nonce',
		slug: 'demo-block',
		slugCamelCase: 'demoBlock',
		slugKebabCase: 'demo-block',
		slugSnakeCase: 'demo_block',
		stateEndpointDeclaration:
			'export const stateEndpoint = createRestEndpoint(getDemoBlockStateEndpoint);',
		textDomain: 'demo-block',
		textdomain: 'demo-block',
			title: 'Demo Block',
			titleCase: 'Demo Block',
			titleJson: JSON.stringify('Demo Block'),
			titleTsLiteral: "'Demo Block'",
			testedUpTo: '6.9',
			ttscLintPluginWpPackageVersion: '^0.2.0',
			writeStateEndpointDeclaration:
				'export const writeStateEndpoint = createRestEndpoint(\n  writeDemoBlockStateEndpoint,\n);',
		};

  const variables: FlatScaffoldTemplateVariables = {
    ...base,
  };

  for (const [key, value] of Object.entries(flatOverrides)) {
    if (value !== undefined) {
      variables[key] = value;
    }
  }

  const family = templateFamily ?? inferTemplateFamily(flatOverrides);
  const compoundPersistenceEnabled =
		family === 'compound' && variables.compoundPersistenceEnabled === 'true';
  const alternateRenderTargets = {
    csv: variables.alternateRenderTargetsCsv,
    enabled: variables.hasAlternateRenderTargets === 'true',
    hasEmail: variables.hasAlternateEmailRenderTarget === 'true',
    hasMjml: variables.hasAlternateMjmlRenderTarget === 'true',
    hasPlainText: variables.hasAlternatePlainTextRenderTarget === 'true',
    json: variables.alternateRenderTargetsJson,
    targets: JSON.parse(variables.alternateRenderTargetsJson) as string[],
  };
  const shared = {
    author: variables.author,
    blockMetadataVersion: variables.blockMetadataVersion,
    category: variables.category,
    compatibility: {
      requiresAtLeast: variables.requiresAtLeast,
      requiresPhp: variables.requiresPhp,
      testedUpTo: variables.testedUpTo,
    },
    cssClassName: variables.cssClassName,
    description: variables.description,
    descriptionJson: variables.descriptionJson,
    frontendCssClassName: variables.frontendCssClassName,
    icon: variables.icon,
    keyword: variables.keyword,
    namespace: variables.namespace,
    pascalCase: variables.pascalCase,
    phpPrefix: variables.phpPrefix,
    phpPrefixUpper: variables.phpPrefixUpper,
    slug: variables.slug,
    slugCamelCase: variables.slugCamelCase,
    slugKebabCase: variables.slugKebabCase,
    slugSnakeCase: variables.slugSnakeCase,
    textDomain: variables.textDomain,
    title: variables.title,
    titleCase: variables.titleCase,
    titleJson: variables.titleJson,
    versions: {
      apiClient: variables.apiClientPackageVersion,
      blockRuntime: variables.blockRuntimePackageVersion,
      blockTypes: variables.blockTypesPackageVersion,
      projectTools: variables.projectToolsPackageVersion,
      rest: variables.restPackageVersion,
    },
  };
  const template = {
    description: variables.description,
  };

  switch (family) {
    case 'query-loop':
      return attachScaffoldTemplateVariableGroups(variables, {
				alternateRenderTargets,
				compound: {
					enabled: false,
					persistenceEnabled: false,
				},
				persistence: {
					enabled: false,
					scope: 'none',
				},
				queryLoop: {
					allowedControls: JSON.parse(
						variables.queryAllowedControlsJson,
					) as string[],
					allowedControlsJson: variables.queryAllowedControlsJson,
					enabled: true,
					postType: variables.queryPostType,
					postTypeJson: variables.queryPostTypeJson,
					variationNamespace: variables.queryVariationNamespace,
					variationNamespaceJson: variables.queryVariationNamespaceJson,
				},
				shared,
				template,
				templateFamily: 'query-loop',
			});
    case 'compound':
      return attachScaffoldTemplateVariableGroups(variables, {
				alternateRenderTargets,
				compound: {
					child: {
						category: variables.compoundChildCategory,
						cssClassName: variables.compoundChildCssClassName,
						icon: variables.compoundChildIcon,
						title: variables.compoundChildTitle,
						titleJson: variables.compoundChildTitleJson,
					},
					enabled: true,
					innerBlocks: {
						description: variables.compoundInnerBlocksPresetDescription,
						directInsert:
							variables.compoundInnerBlocksDirectInsert === 'true',
						label: variables.compoundInnerBlocksPresetLabel,
						orientation:
							variables.compoundInnerBlocksOrientation === 'horizontal' ||
							variables.compoundInnerBlocksOrientation === 'vertical'
								? variables.compoundInnerBlocksOrientation
								: '',
						orientationExpression:
							variables.compoundInnerBlocksOrientationExpression,
						preset: variables.compoundInnerBlocksPreset,
						templateLockExpression:
							variables.compoundInnerBlocksTemplateLockExpression,
					},
					persistenceEnabled: compoundPersistenceEnabled,
				},
				persistence: compoundPersistenceEnabled
					? {
							auth: {
								bootstrapCredentialDeclarations:
									variables.bootstrapCredentialDeclarations,
								descriptionJson: variables.persistencePolicyDescriptionJson,
								intent: variables.restWriteAuthIntent,
								isAuthenticated:
									variables.isAuthenticatedPersistencePolicy === 'true',
								isPublic: variables.isPublicPersistencePolicy === 'true',
								mechanism: variables.restWriteAuthMechanism,
								mode: variables.restWriteAuthMode,
								publicWriteRequestIdDeclaration:
									variables.publicWriteRequestIdDeclaration,
							},
							dataStorageMode: variables.dataStorageMode,
							enabled: true,
							policy: variables.persistencePolicy,
							scope: 'compound-parent',
					  }
					: {
							enabled: false,
							scope: 'none',
					  },
				queryLoop: {
					enabled: false,
				},
				shared,
				template,
				templateFamily: 'compound',
			});
    case 'persistence':
      return attachScaffoldTemplateVariableGroups(variables, {
				alternateRenderTargets,
				compound: {
					enabled: false,
					persistenceEnabled: false,
				},
				persistence: {
					auth: {
						bootstrapCredentialDeclarations:
							variables.bootstrapCredentialDeclarations,
						descriptionJson: variables.persistencePolicyDescriptionJson,
						intent: variables.restWriteAuthIntent,
						isAuthenticated:
							variables.isAuthenticatedPersistencePolicy === 'true',
						isPublic: variables.isPublicPersistencePolicy === 'true',
						mechanism: variables.restWriteAuthMechanism,
						mode: variables.restWriteAuthMode,
						publicWriteRequestIdDeclaration:
							variables.publicWriteRequestIdDeclaration,
					},
					dataStorageMode: variables.dataStorageMode,
					enabled: true,
					policy: variables.persistencePolicy,
					scope: 'single',
				},
				queryLoop: {
					enabled: false,
				},
				shared,
				template,
				templateFamily: 'persistence',
			});
    case 'basic':
    case 'interactivity':
    case 'external':
      return attachScaffoldTemplateVariableGroups(variables, {
				alternateRenderTargets,
				compound: {
					enabled: false,
					persistenceEnabled: false,
				},
				persistence: {
					enabled: false,
					scope: 'none',
				},
				queryLoop: {
					enabled: false,
				},
				shared,
				template,
				templateFamily:
					family === 'basic'
						? 'basic'
						: family === 'interactivity'
							? 'interactivity'
							: 'external',
			});
    default: {
      const unreachableFamily: never = family;
      throw new Error(`Unhandled template family: ${unreachableFamily}`);
    }
  }
}

function inferTemplateFamily(
	overrides: Partial<FlatScaffoldTemplateVariables>,
): ScaffoldTemplateFamily {
  const overrideKeys = Object.keys(overrides);

  if (
		overrideKeys.some(
			(key) =>
				key === 'queryAllowedControlsJson' ||
				key === 'queryPostType' ||
				key === 'queryPostTypeJson' ||
				key === 'queryVariationNamespace' ||
				key === 'queryVariationNamespaceJson',
		)
	) {
    return 'query-loop';
  }

  if (overrideKeys.some((key) => key.startsWith('compound'))) {
    return 'compound';
  }

  if (
		overrideKeys.some(
			(key) =>
				key === 'bootstrapCredentialDeclarations' ||
				key === 'dataStorageMode' ||
				key === 'isAuthenticatedPersistencePolicy' ||
				key === 'isPublicPersistencePolicy' ||
				key === 'persistencePolicy' ||
				key === 'persistencePolicyDescriptionJson' ||
				key === 'publicWriteRequestIdDeclaration' ||
				key === 'restWriteAuthIntent' ||
				key === 'restWriteAuthMechanism' ||
				key === 'restWriteAuthMode',
		)
	) {
    return 'persistence';
  }

  return 'basic';
}
