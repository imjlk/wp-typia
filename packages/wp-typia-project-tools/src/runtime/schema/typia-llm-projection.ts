import { cloneJsonValue } from '../shared/json-utils.js';
import { cloneJsonValueIfDefined } from './typia-llm-json-schema.js';
import {
  applyOpenApiConstraintsToTypiaLlmFunctionArtifact,
  cloneProjectedTypiaLlmFunctionArtifact,
} from './typia-llm-openapi-constraints.js';
import type {
  ProjectedTypiaLlmApplicationArtifact,
  ProjectedTypiaLlmFunctionArtifact,
  ProjectedTypiaLlmStructuredOutputArtifact,
  ProjectTypiaLlmApplicationArtifactOptions,
  ProjectTypiaLlmStructuredOutputArtifactOptions,
  TypiaLlmFunctionLike,
} from './typia-llm-types.js';

/**
 * Projects one compiled `typia.llm` function schema into a JSON-friendly
 * artifact record.
 *
 * @param functionSchema Function schema from a compiled `typia.llm.application(...)`.
 * @returns JSON-friendly function artifact.
 */
export function projectTypiaLlmApplicationFunction(
  functionSchema: TypiaLlmFunctionLike,
): ProjectedTypiaLlmFunctionArtifact {
  return {
    description: functionSchema.description,
    name: functionSchema.name,
    output: cloneJsonValueIfDefined(functionSchema.output),
    parameters: cloneJsonValue(functionSchema.parameters),
    ...(functionSchema.tags ? { tags: [...functionSchema.tags] } : {}),
  };
}

/**
 * Projects a compiled `typia.llm.application(...)` result into a JSON-friendly
 * downstream adapter artifact.
 *
 * @param options Compiled application value and source metadata.
 * @returns JSON-friendly application artifact.
 */
export function projectTypiaLlmApplicationArtifact({
  application,
  generatedFrom,
  openApiProjection,
  transformFunction,
}: ProjectTypiaLlmApplicationArtifactOptions): ProjectedTypiaLlmApplicationArtifact {
  return {
    functions: application.functions.map((functionSchema) => {
      const functionArtifact =
        projectTypiaLlmApplicationFunction(functionSchema);
      const openApiAlignedArtifact = openApiProjection
        ? applyOpenApiConstraintsToTypiaLlmFunctionArtifact({
            functionArtifact,
            openApiDocument: openApiProjection.openApiDocument,
            operationId:
              openApiProjection.resolveOperationId?.(
                functionSchema,
                functionArtifact,
              ) ?? functionSchema.name,
          })
        : functionArtifact;
      const transformedArtifact = transformFunction
        ? transformFunction(openApiAlignedArtifact, functionSchema)
        : openApiAlignedArtifact;

      return cloneProjectedTypiaLlmFunctionArtifact(transformedArtifact);
    }),
    generatedFrom: cloneJsonValue(generatedFrom),
  };
}

/**
 * Projects a compiled `typia.llm.structuredOutput(...)` result into a
 * JSON-friendly downstream adapter artifact.
 *
 * @param options Compiled structured-output value and source metadata.
 * @returns JSON-friendly structured-output artifact.
 */
export function projectTypiaLlmStructuredOutputArtifact({
  generatedFrom,
  structuredOutput,
}: ProjectTypiaLlmStructuredOutputArtifactOptions): ProjectedTypiaLlmStructuredOutputArtifact {
  return {
    generatedFrom: cloneJsonValue(generatedFrom),
    parameters: cloneJsonValue(structuredOutput.parameters),
  };
}
