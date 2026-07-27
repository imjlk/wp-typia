/**
 * Generate the `scripts/sync-ai-features.ts` source that projects AI-safe schemas for workspace features.
 */
export function buildAiFeatureSyncScriptSource(): string {
  return `/* eslint-disable no-console */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { projectWordPressAiSchema } from '@wp-typia/project-tools/ai-artifacts';

import { AI_FEATURES, type WorkspaceAiFeatureConfig } from './block-config';

function parseCliOptions(argv: string[]) {
  const options = {
    check: false,
  };

  for (const argument of argv) {
    if (argument === '--check') {
      options.check = true;
      continue;
    }

    throw new Error(\`Unknown sync-ai flag: \${argument}\`);
  }

  return options;
}

function isWorkspaceAiFeature(
  feature: WorkspaceAiFeatureConfig,
): feature is WorkspaceAiFeatureConfig & {
  aiSchemaFile: string;
  typesFile: string;
} {
  return (
    typeof feature.aiSchemaFile === 'string' &&
    typeof feature.typesFile === 'string'
  );
}

function normalizeGeneratedArtifactContent(content: string) {
  return content.replace(/\\r\\n?/g, '\\n');
}

async function reconcileGeneratedArtifact(options: {
  check: boolean;
  content: string;
  filePath: string;
  label: string;
}) {
  if (!options.check) {
    await mkdir(path.dirname(options.filePath), {
      recursive: true,
    });
    await writeFile(options.filePath, options.content, 'utf8');
    return;
  }

  const current = normalizeGeneratedArtifactContent(
    await readFile(options.filePath, 'utf8'),
  );
  const expected = normalizeGeneratedArtifactContent(options.content);
  if (current !== expected) {
    throw new Error(
      \`Generated AI feature artifact is stale: \${options.label} (\${options.filePath}).\`,
    );
  }
}

async function loadJsonDocument(filePath: string) {
  let source: string;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(
      \`Failed to read AI schema document at \${filePath}: \${
        error instanceof Error ? error.message : String(error)
      }\`,
    );
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(
      \`Failed to parse AI schema document at \${filePath}: \${
        error instanceof Error ? error.message : String(error)
      }\`,
    );
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error(\`Expected \${filePath} to decode to a JSON object.\`);
  }

  return decoded as Parameters<typeof projectWordPressAiSchema>[0];
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const aiFeatures = AI_FEATURES.filter(isWorkspaceAiFeature);
  if (AI_FEATURES.length > 0 && aiFeatures.length === 0) {
    console.warn(
      '⚠️ AI_FEATURES entries exist, but none satisfied the generated sync-ai guard. Check for missing aiSchemaFile/typesFile fields in scripts/block-config.ts.',
    );
  }

  if (aiFeatures.length === 0) {
    console.log(
      options.check
        ? 'ℹ️ No workspace AI features are registered yet. \`sync-ai --check\` is already clean.'
        : 'ℹ️ No workspace AI features are registered yet.',
    );
    return;
  }

  for (const feature of aiFeatures) {
    const sourceSchemaPath = path.join(
      path.dirname(feature.typesFile),
      'api-schemas',
      'feature-result.schema.json',
    );
    const sourceSchema = await loadJsonDocument(sourceSchemaPath);
    const aiSchema = projectWordPressAiSchema(sourceSchema);
    await reconcileGeneratedArtifact({
      check: options.check,
      content: \`\${JSON.stringify(aiSchema, null, 2)}\\n\`,
      filePath: feature.aiSchemaFile,
      label: feature.slug,
    });
  }

  console.log(
    options.check
      ? '✅ AI feature structured-output schemas are already synchronized.'
      : '✅ AI feature structured-output schemas were synchronized.',
  );
}

main().catch((error) => {
  console.error('❌ AI feature sync failed:', error);
  process.exit(1);
});
`;
}
