/* eslint-disable no-console */
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { ILlmFunction, ILlmStructuredOutput } from "typia";
import { BLOCKS } from "../../persistence-examples/scripts/block-config";
import type { EndpointManifestDefinition } from "../../../packages/wp-typia-block-runtime/src/metadata-core";
import type { OpenApiDocument } from "@wp-typia/project-tools/schema-core";
import {
  buildTypiaLlmEndpointMethodDescriptors,
  projectTypiaLlmStructuredOutputArtifact,
  renderTypiaLlmModule,
  syncTypiaLlmAdapterModule,
  projectTypiaLlmApplicationArtifact,
  type ProjectedTypiaLlmApplicationArtifact,
  type ProjectedTypiaLlmStructuredOutputArtifact,
  type TypiaLlmEndpointMethodDescriptor,
} from "@wp-typia/project-tools/typia-llm";

export type {
  ProjectedTypiaLlmApplicationArtifact,
  ProjectedTypiaLlmStructuredOutputArtifact,
  ProjectedTypiaLlmStructuredOutputArtifact as ProjectedTypiaStructuredOutputArtifact,
} from "@wp-typia/project-tools/typia-llm";

const execFileAsync = promisify(execFile);

interface SyncTypiaLlmCliOptions {
  check: boolean;
}

interface GeneratedArtifactFile {
  content: string;
  path: string;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_ROOT = path.resolve(SCRIPT_DIR, "..");
const COUNTER_BLOCK = (() => {
  const block = BLOCKS.find((candidate) => candidate.slug === "counter");
  if (!block) {
    throw new Error(
      "Unable to locate the persistence counter block configuration."
    );
  }

  return block;
})();
const COUNTER_LLM_MANIFEST: EndpointManifestDefinition = {
  ...COUNTER_BLOCK.restManifest,
  endpoints: COUNTER_BLOCK.restManifest.endpoints.filter(
    (endpoint) => endpoint.operationId !== "getPersistenceCounterBootstrap"
  ),
};

const GENERATED_DIR = path.join(EXAMPLE_ROOT, "src", "typia-llm");
const GENERATED_SOURCE_FILE = path.join(
  GENERATED_DIR,
  "counter.llm.generated.ts"
);
const GENERATED_APPLICATION_FILE = path.join(
  GENERATED_DIR,
  "counter.llm.application.json"
);
const GENERATED_STRUCTURED_OUTPUT_FILE = path.join(
  GENERATED_DIR,
  "counter-response.structured-output.json"
);
const COMPILED_OUTPUT_DIR = path.join(EXAMPLE_ROOT, ".typia-llm-dist");
const TSCONFIG_FILE = path.join(EXAMPLE_ROOT, "tsconfig.typia-llm.json");
export const COUNTER_LLM_GENERATED_SOURCE_RELATIVE_PATH = path.relative(
  EXAMPLE_ROOT,
  GENERATED_SOURCE_FILE
);
export const COUNTER_LLM_APPLICATION_RELATIVE_PATH = path.relative(
  EXAMPLE_ROOT,
  GENERATED_APPLICATION_FILE
);
export const COUNTER_LLM_STRUCTURED_OUTPUT_RELATIVE_PATH = path.relative(
  EXAMPLE_ROOT,
  GENERATED_STRUCTURED_OUTPUT_FILE
);

function getCounterApiTypesFile(): string {
  return path.resolve(
    EXAMPLE_ROOT,
    "..",
    "persistence-examples",
    "src",
    "blocks",
    "counter",
    "api-types.ts"
  );
}

function getCounterAiSchemaFile(): string {
  return path.resolve(
    EXAMPLE_ROOT,
    "..",
    "persistence-examples",
    "src",
    "blocks",
    "counter",
    "wordpress-ai",
    "counter-response.ai.schema.json"
  );
}

function getCounterOpenApiFile(): string {
  return path.resolve(
    EXAMPLE_ROOT,
    "..",
    "persistence-examples",
    "src",
    "blocks",
    "counter",
    "api.openapi.json"
  );
}

function toPosixRelativePath(fromFile: string, targetFile: string): string {
  const relative = path
    .relative(path.dirname(fromFile), targetFile)
    .split(path.sep)
    .join("/");
  return relative.startsWith(".")
    ? relative.replace(/\.ts$/, "")
    : `./${relative.replace(/\.ts$/, "")}`;
}

function parseCliOptions(argv: string[]): SyncTypiaLlmCliOptions {
  const options: SyncTypiaLlmCliOptions = {
    check: false,
  };

  for (const argument of argv) {
    if (argument === "--check") {
      options.check = true;
      continue;
    }

    throw new Error(`Unknown sync-typia-llm flag: ${argument}`);
  }

  return options;
}

function normalizeGeneratedArtifactContentForComparison(
  content: string
): string {
  return content.replace(/\r\n?/g, "\n");
}

async function reconcileGeneratedArtifacts(
  artifacts: readonly GeneratedArtifactFile[],
  options: SyncTypiaLlmCliOptions
) {
  if (options.check !== true) {
    await mkdir(GENERATED_DIR, { recursive: true });

    for (const artifact of artifacts) {
      await writeFile(artifact.path, artifact.content, "utf8");
    }

    return;
  }

  const issues: string[] = [];

  for (const artifact of artifacts) {
    try {
      const current = await readFile(artifact.path, "utf8");
      if (
        normalizeGeneratedArtifactContentForComparison(current) !==
        normalizeGeneratedArtifactContentForComparison(artifact.content)
      ) {
        issues.push(`- ${artifact.path} (stale)`);
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        issues.push(`- ${artifact.path} (missing)`);
        continue;
      }

      throw error;
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Generated artifacts are missing or stale:\n${issues.join("\n")}`
    );
  }
}

async function readCounterOpenApiDocument(): Promise<OpenApiDocument> {
  return JSON.parse(
    await readFile(getCounterOpenApiFile(), "utf8")
  ) as OpenApiDocument;
}

async function importCompiledModule(moduleFile: string): Promise<{
  counterLlmApplication: { functions: ILlmFunction[] };
  counterResponseStructuredOutput: ILlmStructuredOutput;
}> {
  const require = createRequire(import.meta.url);
  return require(moduleFile) as {
    counterLlmApplication: { functions: ILlmFunction[] };
    counterResponseStructuredOutput: ILlmStructuredOutput;
  };
}

async function compileGeneratedModule() {
  const require = createRequire(import.meta.url);
  const ttscPackageJsonPath = require.resolve("ttsc/package.json");
  const ttscManifest = JSON.parse(
    await readFile(ttscPackageJsonPath, "utf8")
  ) as {
    bin?: string | Record<string, string>;
  };
  const ttscBinEntry =
    typeof ttscManifest.bin === "string"
      ? ttscManifest.bin
      : ttscManifest.bin?.ttsc;
  if (typeof ttscBinEntry !== "string" || ttscBinEntry.length === 0) {
    throw new Error("Unable to locate the ttsc CLI entry point.");
  }
  const ttscBin = path.resolve(
    path.dirname(ttscPackageJsonPath),
    ttscBinEntry
  );

  await rm(COMPILED_OUTPUT_DIR, { force: true, recursive: true });
  await execFileAsync("node", [ttscBin, "-p", TSCONFIG_FILE], {
    cwd: EXAMPLE_ROOT,
    env: process.env,
  });
}

function getCompiledModuleFile(): string {
  return path.join(
    COMPILED_OUTPUT_DIR,
    "api-contract-adapter-poc",
    "src",
    "typia-llm",
    "counter.llm.generated.js"
  );
}

export function buildCounterTypiaLlmMethodDescriptors(
  manifest: EndpointManifestDefinition = COUNTER_LLM_MANIFEST
): TypiaLlmEndpointMethodDescriptor[] {
  return buildTypiaLlmEndpointMethodDescriptors(manifest);
}

export function renderCounterTypiaLlmGeneratedSource(
  manifest: EndpointManifestDefinition = COUNTER_LLM_MANIFEST
): string {
  return renderTypiaLlmModule({
    applicationExportName: "counterLlmApplication",
    interfaceName: "CounterRestToolController",
    manifest,
    structuredOutputExportName: "counterResponseStructuredOutput",
    structuredOutputTypeName: "PersistenceCounterResponse",
    typesImportPath: toPosixRelativePath(
      GENERATED_SOURCE_FILE,
      getCounterApiTypesFile()
    ),
  });
}

export async function buildCounterTypiaLlmArtifacts(): Promise<{
  applicationArtifact: ProjectedTypiaLlmApplicationArtifact;
  structuredOutputArtifact: ProjectedTypiaLlmStructuredOutputArtifact;
}> {
  try {
    await compileGeneratedModule();

    const compiledModule = await importCompiledModule(getCompiledModuleFile());
    const openApiDocument = await readCounterOpenApiDocument();

    return {
      applicationArtifact: projectTypiaLlmApplicationArtifact({
        application: compiledModule.counterLlmApplication,
        generatedFrom: {
          baselineOpenApiPath: path.relative(
            EXAMPLE_ROOT,
            getCounterOpenApiFile()
          ),
          blockSlug: COUNTER_BLOCK.slug,
          manifestSource: "endpoint-manifest+typescript",
        },
        openApiProjection: {
          openApiDocument,
        },
      }),
      structuredOutputArtifact: projectTypiaLlmStructuredOutputArtifact({
        generatedFrom: {
          aiSchemaPath: path.relative(EXAMPLE_ROOT, getCounterAiSchemaFile()),
          blockSlug: COUNTER_BLOCK.slug,
          outputTypeName: "PersistenceCounterResponse",
        },
        structuredOutput: compiledModule.counterResponseStructuredOutput,
      }),
    };
  } finally {
    await rm(COMPILED_OUTPUT_DIR, { force: true, recursive: true });
  }
}

export async function syncCounterTypiaLlmArtifacts(
  options: SyncTypiaLlmCliOptions = { check: false }
) {
  await syncTypiaLlmAdapterModule({
    applicationExportName: "counterLlmApplication",
    check: options.check,
    generatedSourceFile: GENERATED_SOURCE_FILE,
    interfaceName: "CounterRestToolController",
    manifest: COUNTER_LLM_MANIFEST,
    structuredOutputExportName: "counterResponseStructuredOutput",
    structuredOutputTypeName: "PersistenceCounterResponse",
    typesImportPath: toPosixRelativePath(
      GENERATED_SOURCE_FILE,
      getCounterApiTypesFile()
    ),
  });

  const { applicationArtifact, structuredOutputArtifact } =
    await buildCounterTypiaLlmArtifacts();

  await reconcileGeneratedArtifacts(
    [
      {
        content: JSON.stringify(applicationArtifact, null, 2) + "\n",
        path: GENERATED_APPLICATION_FILE,
      },
      {
        content: JSON.stringify(structuredOutputArtifact, null, 2) + "\n",
        path: GENERATED_STRUCTURED_OUTPUT_FILE,
      },
    ],
    options
  );
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (entrypoint === import.meta.url) {
  Promise.resolve()
    .then(() => parseCliOptions(process.argv.slice(2)))
    .then(async (options) => {
      await syncCounterTypiaLlmArtifacts(options);
      console.log(
        options.check
          ? "✅ typia.llm artifacts are already up to date!"
          : "✅ typia.llm artifacts generated from the REST manifest and Typia contracts!"
      );
    })
    .catch((error) => {
      console.error("❌ typia.llm sync failed:", error);
      process.exit(1);
    });
}
