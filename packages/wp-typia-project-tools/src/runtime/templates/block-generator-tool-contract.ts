import {
  buildBuiltInBlockArtifacts,
  stringifyBuiltInBlockJsonDocument,
  type BuiltInBlockArtifact,
} from './built-in-block-artifacts.js';
import {
  buildBuiltInCodeArtifacts,
  type BuiltInCodeArtifact,
} from './built-in-block-code-artifacts.js';
import {
  BlockGeneratorService,
  type PlanBlockInput,
  type PlanBlockResult,
  type RenderBlockResult,
  type ValidateBlockResult,
} from './block-generator-service.js';
import type { ManifestDocument } from '../migration/migration-types.js';
import {
  getStarterManifestFiles,
  stringifyStarterManifest,
} from './starter-manifests.js';
import { listInterpolatedDirectoryOutputs } from './template-render.js';
import type { BuiltInTemplateId } from './template-registry.js';

/**
 * Semantic version marker for the public block generation tool contract.
 *
 * Increment this number whenever the serialized inspection payload changes in a
 * breaking way.
 */
export const BLOCK_GENERATION_TOOL_CONTRACT_VERSION = 1 as const;

/**
 * Staged execution points for the non-mutating inspection workflow.
 *
 * - `"plan"` returns the normalized `BlockSpec` and target metadata.
 * - `"validate"` returns the validated generation stage without rendering.
 * - `"render"` returns the full non-mutating preview, including copied and
 *   emitted file snapshots.
 */
export type BlockGenerationToolStage = 'plan' | 'validate' | 'render';

/**
 * Input for the staged, non-mutating block generation inspection entrypoint.
 *
 * Extends `PlanBlockInput` with an optional `stopAfter` selector so callers can
 * stop at `plan`, `validate`, or continue through the full `render` preview.
 */
export interface InspectBlockGenerationInput extends PlanBlockInput {
  stopAfter?: BlockGenerationToolStage;
}

export interface BlockGenerationTemplateCopyPreview {
  owner: 'template-copy';
  relativePath: string;
}

export interface BlockGenerationEmittedFilePreview {
  kind: 'generated-source' | 'starter-manifest' | 'structural';
  owner: 'emitter';
  relativePath: string;
  source: string;
}

export interface BlockGenerationStarterManifestPreview {
  document: ManifestDocument;
  owner: 'emitter';
  relativePath: string;
  source: string;
}

export interface BlockGenerationRenderPreview {
  copiedTemplateFiles: BlockGenerationTemplateCopyPreview[];
  emittedFiles: BlockGenerationEmittedFilePreview[];
  postRender: RenderBlockResult['postRender'] & {
    installsDependencies: boolean;
  };
  selectedVariant: null;
  starterManifestFiles: BlockGenerationStarterManifestPreview[];
  template: {
    description: string;
    family: BuiltInTemplateId;
    features: string[];
    format: 'wp-typia';
  };
  warnings: string[];
  readmeContent: string;
  gitignoreContent: string;
}

interface BlockGenerationInspectionBase {
  contractVersion: typeof BLOCK_GENERATION_TOOL_CONTRACT_VERSION;
  mutatesWorkspace: false;
  stage: BlockGenerationToolStage;
}

export interface InspectBlockGenerationPlanResult
	extends BlockGenerationInspectionBase {
  plan: PlanBlockResult;
  stage: 'plan';
}

export interface InspectBlockGenerationValidateResult
	extends BlockGenerationInspectionBase {
  plan: PlanBlockResult;
  stage: 'validate';
  validated: ValidateBlockResult;
}

export interface InspectBlockGenerationRenderResult
	extends BlockGenerationInspectionBase {
  plan: PlanBlockResult;
  rendered: BlockGenerationRenderPreview;
  stage: 'render';
  validated: ValidateBlockResult;
}

export type InspectBlockGenerationResult =
	| InspectBlockGenerationPlanResult
	| InspectBlockGenerationValidateResult
	| InspectBlockGenerationRenderResult;

function buildStarterManifestPreviews(
	templateId: string,
	variables: RenderBlockResult['variables'],
	artifacts: readonly BuiltInBlockArtifact[],
): BlockGenerationStarterManifestPreview[] {
  const starterManifests = getStarterManifestFiles(templateId, variables);
  const artifactManifests = new Map(
    artifacts.map((artifact) => [
      `${artifact.relativeDir}/typia.manifest.json`,
      artifact.manifestDocument,
    ]),
  );

  return starterManifests
		.map((entry) => {
			const document = artifactManifests.get(entry.relativePath) ?? entry.document;
			return {
				document,
				owner: 'emitter' as const,
				relativePath: entry.relativePath,
				source: stringifyStarterManifest(document),
			};
		})
		.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function buildStructuralArtifactPreviews(
	artifacts: readonly BuiltInBlockArtifact[],
): BlockGenerationEmittedFilePreview[] {
  return artifacts
		.flatMap((artifact) => [
			{
				kind: 'structural' as const,
				owner: 'emitter' as const,
				relativePath: `${artifact.relativeDir}/block.json`,
				source: stringifyBuiltInBlockJsonDocument(artifact.blockJsonDocument),
			},
			{
				kind: 'structural' as const,
				owner: 'emitter' as const,
				relativePath: `${artifact.relativeDir}/types.ts`,
				source: artifact.typesSource,
			},
		])
		.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function buildCodeArtifactPreviews(
	codeArtifacts: readonly BuiltInCodeArtifact[],
): BlockGenerationEmittedFilePreview[] {
  return codeArtifacts
		.map((artifact) => ({
			kind: 'generated-source' as const,
			owner: 'emitter' as const,
			relativePath: artifact.relativePath,
			source: artifact.source,
		}))
		.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function buildRenderPreview(
	rendered: RenderBlockResult,
): Promise<BlockGenerationRenderPreview> {
  const artifacts = buildBuiltInBlockArtifacts({
    templateId: rendered.spec.template.family,
    variables: rendered.variables,
  });
  const codeArtifacts = buildBuiltInCodeArtifacts({
    templateId: rendered.spec.template.family,
    variables: rendered.variables,
  });
  const copiedTemplateFiles = await listInterpolatedDirectoryOutputs(
    rendered.templateDir,
    rendered.variables,
  );

  return {
		copiedTemplateFiles: copiedTemplateFiles.map((relativePath) => ({
			owner: 'template-copy' as const,
			relativePath,
		})),
		emittedFiles: [
			...buildStructuralArtifactPreviews(artifacts),
			...buildCodeArtifactPreviews(codeArtifacts),
		].sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
		gitignoreContent: rendered.gitignoreContent,
		postRender: {
			...rendered.postRender,
			installsDependencies: !rendered.target.noInstall,
		},
		readmeContent: rendered.readmeContent,
		selectedVariant: rendered.selectedVariant,
		starterManifestFiles: buildStarterManifestPreviews(
			rendered.spec.template.family,
			rendered.variables,
			artifacts,
		),
		template: {
			description: rendered.spec.template.description,
			family: rendered.spec.template.family,
			features: [...rendered.spec.template.features],
			format: 'wp-typia',
		},
		warnings: [...rendered.warnings],
	};
}

export function inspectBlockGeneration(
	input: InspectBlockGenerationInput & { stopAfter: 'plan' },
	service?: BlockGeneratorService,
): Promise<InspectBlockGenerationPlanResult>;
export function inspectBlockGeneration(
	input: InspectBlockGenerationInput & { stopAfter: 'validate' },
	service?: BlockGeneratorService,
): Promise<InspectBlockGenerationValidateResult>;
export function inspectBlockGeneration(
	input: InspectBlockGenerationInput & { stopAfter?: 'render' | undefined },
	service?: BlockGeneratorService,
): Promise<InspectBlockGenerationRenderResult>;
/**
 * Inspects built-in block generation through the staged generator boundary
 * without mutating the destination workspace.
 *
 * Use `stopAfter` to halt after the `plan`, `validate`, or `render` stage.
 * The render stage includes copied template file paths, emitter-owned source
 * previews, starter manifest previews, and post-render intent metadata. Any
 * temporary render state is cleaned up before the promise resolves.
 *
 * @example
 * ```ts
 * const inspection = await inspectBlockGeneration({
 * 	answers,
 * 	noInstall: true,
 * 	packageManager: "bun",
 * 	projectDir: "demo-block",
 * 	templateId: "basic",
 * 	stopAfter: "render",
 * });
 * ```
 *
 * @param input - Planning input plus an optional `stopAfter` stage selector.
 * @param service - Optional generator service instance. Defaults to a new
 * `BlockGeneratorService`.
 * @returns The serialized inspection result for the reached stage.
 * @throws Propagates planning, validation, or render failures from
 * `BlockGeneratorService`.
 */
export async function inspectBlockGeneration(
	{
		stopAfter = 'render',
		...planInput
	}: InspectBlockGenerationInput,
	service = new BlockGeneratorService(),
): Promise<InspectBlockGenerationResult> {
  const plan = await service.plan(planInput);
  if (stopAfter === 'plan') {
    return {
      contractVersion: BLOCK_GENERATION_TOOL_CONTRACT_VERSION,
      mutatesWorkspace: false,
      plan,
      stage: 'plan',
    };
  }

  const validated = await service.validate({ plan });
  if (stopAfter === 'validate') {
    return {
      contractVersion: BLOCK_GENERATION_TOOL_CONTRACT_VERSION,
      mutatesWorkspace: false,
      plan,
      stage: 'validate',
      validated,
    };
  }

  const rendered = await service.render({ validated });
  try {
    return {
      contractVersion: BLOCK_GENERATION_TOOL_CONTRACT_VERSION,
      mutatesWorkspace: false,
      plan,
      rendered: await buildRenderPreview(rendered),
      stage: 'render',
      validated,
    };
  } finally {
    await rendered.cleanup?.();
  }
}
